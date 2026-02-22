import ifcopenshell
import ifcopenshell.geom
from pxr import Usd, UsdGeom, UsdShade, Sdf, Gf, Vt
import os
import json
import argparse
import re
import time

# Load the provided class list config
try:
    with open('ifc_classes_list.json', 'r') as f:
        IFC_METADATA_CONFIG = json.load(f)["Unique_IFC_Classes"]
except:
    IFC_METADATA_CONFIG = {}

# Attributes to skip to keep the 'ifc' customData dictionary clean
SKIP_LIST = [
    "ObjectPlacement", "Representation",
    "RepresentationContexts", "UnitsInContext", "OwnerHistory"
]

def report_progress(percentage, message):
    """Output progress as JSON for debugging/UI tracking"""
    progress_data = {"type": "progress", "percentage": percentage, "message": message}
    print(json.dumps(progress_data), flush=True)

def get_safe_name(text):
    """Sanitizes IFC IDs for USD paths."""
    return re.sub(r'[^a-zA-Z0-9_]', '_', text)

def ensure_usd_compatible(val):
    """Ensures values are compatible with USD VtDictionaries.

    USD SetCustomDataByKey / SetAssetInfo only accept scalar types (str, int,
    float, bool) or nested dicts.  Python lists are stored as vector<VtValue>
    which is an unregistered C++ type and prints a GetType warning at runtime.
    Lists/tuples are therefore serialised to a comma-separated string instead.
    """
    if isinstance(val, (str, int, float, bool)):
        return val
    if hasattr(val, 'wrappedValue'):
        return ensure_usd_compatible(val.wrappedValue)
    if isinstance(val, (list, tuple)):
        # Flatten to a string so USD stores it as a scalar, not vector<VtValue>
        return ", ".join(str(ensure_usd_compatible(x)) for x in val)
    return str(val)

def _extract_surface_styles(styled_item):
    """Extracts IfcSurfaceStyle objects from an IfcStyledItem.

    IFC2x3 wraps styles inside IfcPresentationStyleAssignment before IfcSurfaceStyle,
    whereas IFC4 allows IfcSurfaceStyle directly in IfcStyledItem.Styles.
    This handles both schemas transparently.
    """
    styles = []
    for entry in (styled_item.Styles or []):
        if entry.is_a("IfcSurfaceStyle"):
            styles.append(entry)
        elif entry.is_a("IfcPresentationStyleAssignment"):
            for s in (entry.Styles or []):
                if s.is_a("IfcSurfaceStyle"):
                    styles.append(s)
    return styles

# ---------------------------------------------------------------------------
# Step 1 — Standalone helper: extract IfcSurfaceStyleRendering from a style
# ---------------------------------------------------------------------------

def _extract_rendering_from_surface_style(surface_style):
    """Returns the first IfcSurfaceStyleRendering found inside an IfcSurfaceStyle.

    IfcSurfaceStyleRendering is a subtype of IfcSurfaceStyleShading, so the
    is_a("IfcSurfaceStyleRendering") check correctly identifies it.
    Returns None if the style is None or contains no rendering sub-style.
    """
    if surface_style is None:
        return None
    try:
        for s in (surface_style.Styles or []):
            if s.is_a("IfcSurfaceStyleRendering"):
                return s
    except Exception:
        pass
    return None

# ---------------------------------------------------------------------------
# Step 2 — Standalone helper: resolve IfcColourOrFactor to Gf.Vec3f
# ---------------------------------------------------------------------------

def _colour_or_factor_to_vec3(col_or_factor, base):
    """Converts an IfcColourOrFactor SELECT value to a Gf.Vec3f.

    IfcColourOrFactor is either:
      - IfcColourRgb  → return Vec3f(Red, Green, Blue)
      - a scalar IfcNormalisedRatioMeasure (wrappedValue) → return base * scalar
    Falls back to base when the value is unrecognised or None.
    """
    if col_or_factor is None:
        return base
    try:
        if col_or_factor.is_a("IfcColourRgb"):
            return Gf.Vec3f(
                float(col_or_factor.Red),
                float(col_or_factor.Green),
                float(col_or_factor.Blue),
            )
    except Exception:
        pass
    try:
        if hasattr(col_or_factor, "wrappedValue"):
            scalar = float(col_or_factor.wrappedValue)
            return Gf.Vec3f(base[0] * scalar, base[1] * scalar, base[2] * scalar)
    except Exception:
        pass
    return base

# ---------------------------------------------------------------------------
# Step 8 — Standalone function: get presentation layer assignments
# ---------------------------------------------------------------------------

def get_layer_assignments_from_element(element):
    """Returns a deduplicated list of presentation layer dicts for an element.

    Traverses element.Representation.Representations[*].Items and collects
    every IfcPresentationLayerAssignment via the inverse LayerAssignment attr.
    Each dict has keys: Name, Description, Identifier.
    """
    if not (hasattr(element, "Representation") and element.Representation):
        return []
    seen_names = set()
    layers = []
    try:
        for rep in (element.Representation.Representations or []):
            for item in (getattr(rep, "Items", None) or []):
                for la in (getattr(item, "LayerAssignment", []) or []):
                    name = getattr(la, "Name", None) or ""
                    if name not in seen_names:
                        seen_names.add(name)
                        layers.append({
                            "Name": ensure_usd_compatible(name),
                            "Description": ensure_usd_compatible(
                                getattr(la, "Description", "") or ""
                            ),
                            "Identifier": ensure_usd_compatible(
                                getattr(la, "Identifier", "") or ""
                            ),
                        })
    except Exception:
        pass
    return layers


class MaterialManager:
    """Handles unique material creation by merging BIM names and Visual Styles."""

    def __init__(self, stage, ifc_file):
        self.stage = stage
        self._ifc_file = ifc_file  # kept for direct entity ID lookups
        self.material_cache = {}
        self.look_path = Sdf.Path("/_Materials")
        UsdGeom.Scope.Define(self.stage, self.look_path)
        # Build lookup: IfcMaterial entity ID → IfcSurfaceStyle
        self._mat_style_cache = self._build_mat_def_rep_cache(ifc_file)
        # Step 3 — Build lookup: material name → IfcSurfaceStyleRendering
        self._name_to_rendering = self._build_name_rendering_lookup(ifc_file)

    def _build_mat_def_rep_cache(self, ifc_file):
        """Scans IfcMaterialDefinitionRepresentation to build {material_id → IfcSurfaceStyle}.

        Every IfcMaterial in a Revit IFC export has a companion
        IfcMaterialDefinitionRepresentation that stores its visual colour via
        an IfcStyledItem → IfcSurfaceStyle chain.  This cache lets us look up
        the correct style for any material even when no IfcStyledItem is
        embedded in the element's own geometry representation.
        """
        cache = {}
        try:
            for mat_rep in ifc_file.by_type("IfcMaterialDefinitionRepresentation"):
                material = getattr(mat_rep, "RepresentedMaterial", None)
                if material is None:
                    continue
                mat_id = material.id()
                if mat_id in cache:
                    continue
                for rep in (getattr(mat_rep, "Representations", None) or []):
                    for item in (getattr(rep, "Items", None) or []):
                        if item.is_a("IfcStyledItem"):
                            for style in _extract_surface_styles(item):
                                cache[mat_id] = style
                                break
                        if mat_id in cache:
                            break
                    if mat_id in cache:
                        break
        except:
            pass
        return cache

    # Step 3 — New method
    def _build_name_rendering_lookup(self, ifc_file):
        """Builds {material_name → IfcSurfaceStyleRendering} and the reverse
        {rendering_entity_id → material_name} from two sources:

        Phase 1 (Revit): IfcMaterialDefinitionRepresentation cache — each
          IfcMaterial has an explicit style representation.

        Phase 2 (TrimBimToIFC / Nexus): IfcRelAssociatesMaterial — styles are
          embedded in element geometry via IfcStyledItem.  For each single
          IfcMaterial association we harvest the element's geometry-embedded
          rendering and map it back to the material name.
        """
        cache = {}
        self._rendering_id_to_mat_name = {}

        # Phase 1: IfcMaterialDefinitionRepresentation (Revit-style exports)
        try:
            for mat in ifc_file.by_type("IfcMaterial"):
                style = self._mat_style_cache.get(mat.id())
                rendering = _extract_rendering_from_surface_style(style)
                if rendering and mat.Name:
                    cache[mat.Name] = rendering
                    self._rendering_id_to_mat_name[rendering.id()] = mat.Name
        except Exception:
            pass

        # Phase 2: element-embedded styles (TrimBimToIFC / Nexus-style exports).
        # Only run if Phase 1 produced no reverse mappings (avoids double-work
        # on Revit files which already populate the dict in Phase 1).
        if not self._rendering_id_to_mat_name:
            try:
                for rel in ifc_file.by_type("IfcRelAssociatesMaterial"):
                    rm = rel.RelatingMaterial
                    if not rm.is_a("IfcMaterial"):
                        continue
                    mat_name = getattr(rm, "Name", None)
                    if not mat_name:
                        continue
                    # Sample the first related element to get the embedded style
                    related = getattr(rel, "RelatedObjects", []) or []
                    for element in related[:1]:
                        if not (hasattr(element, "Representation")
                                and element.Representation):
                            continue
                        for rep in (element.Representation.Representations or []):
                            for style in self._collect_styles_from_rep(rep):
                                rendering = _extract_rendering_from_surface_style(style)
                                if rendering:
                                    if mat_name not in cache:
                                        cache[mat_name] = rendering
                                    self._rendering_id_to_mat_name[rendering.id()] = mat_name
                                    break
                            if mat_name in cache:
                                break
            except Exception:
                pass

        return cache

    def get_style_for_material(self, relating_material):
        """Returns an IfcSurfaceStyle for any IFC material container type.

        Looks up each constituent IfcMaterial in the IfcMaterialDefinitionRepresentation
        cache built at initialisation.  For sets/lists the first material with a
        cached style wins (preserving IFC order so the most significant layer/
        constituent takes priority).
        """
        if relating_material is None:
            return None
        t = relating_material.is_a()

        if t == "IfcMaterial":
            return self._mat_style_cache.get(relating_material.id())

        if t == "IfcMaterialList":
            for mat in (relating_material.Materials or []):
                s = self._mat_style_cache.get(mat.id())
                if s:
                    return s

        if t == "IfcMaterialLayerSetUsage":
            return self.get_style_for_material(getattr(relating_material, "ForLayerSet", None))

        if t == "IfcMaterialLayerSet":
            for layer in (getattr(relating_material, "MaterialLayers", None) or []):
                mat = getattr(layer, "Material", None)
                if mat:
                    s = self._mat_style_cache.get(mat.id())
                    if s:
                        return s

        if t == "IfcMaterialProfileSetUsage":
            return self.get_style_for_material(getattr(relating_material, "ForProfileSet", None))

        if t == "IfcMaterialProfileSet":
            for profile in (getattr(relating_material, "MaterialProfiles", None) or []):
                mat = getattr(profile, "Material", None)
                if mat:
                    s = self._mat_style_cache.get(mat.id())
                    if s:
                        return s

        if t == "IfcMaterialConstituentSet":
            for constituent in (getattr(relating_material, "MaterialConstituents", None) or []):
                mat = getattr(constituent, "Material", None)
                if mat:
                    s = self._mat_style_cache.get(mat.id())
                    if s:
                        return s

        return None

    def _collect_styles_from_rep(self, rep):
        """Collects all IfcSurfaceStyle objects from one IfcShapeRepresentation.

        Three cases are handled per item in rep.Items:
          A) The item IS an IfcStyledItem (directly embedded in the representation).
          B) The item is a geometry primitive with an inverse StyledByItem link.
          C) The item is an IfcMappedItem (reused geometry block) — recurse into
             its MappedRepresentation so mapped geometry styles are not missed.
        """
        styles = []
        for item in (rep.Items or []):
            if item.is_a("IfcStyledItem"):
                # Case A: the styled item IS the representation item
                styles.extend(_extract_surface_styles(item))
            elif item.is_a("IfcMappedItem"):
                # Case C: reused geometry — styles live inside the mapped rep
                mapped_rep = getattr(
                    getattr(item, "MappingSource", None), "MappedRepresentation", None
                )
                if mapped_rep:
                    styles.extend(self._collect_styles_from_rep(mapped_rep))
            else:
                # Case B: geometry item with inverse StyledByItem relationship
                for styled in (getattr(item, "StyledByItem", []) or []):
                    styles.extend(_extract_surface_styles(styled))
        return styles

    # Step 4 — Replaces get_styles_from_element
    def get_rendering_from_element(self, element):
        """Returns the first IfcSurfaceStyleRendering embedded in the element's geometry."""
        if not (hasattr(element, "Representation") and element.Representation):
            return None
        try:
            for rep in element.Representation.Representations:
                for style in self._collect_styles_from_rep(rep):
                    rendering = _extract_rendering_from_surface_style(style)
                    if rendering:
                        return rendering  # first geometry-embedded rendering wins
        except Exception:
            pass
        return None

    # Step 5 — Replaces get_style_for_material (rendering variant)
    def get_rendering_for_material(self, relating_material):
        """Returns an IfcSurfaceStyleRendering for any IFC material container type."""
        style = self.get_style_for_material(relating_material)
        return _extract_rendering_from_surface_style(style)

    # Step 6
    def get_rendering_by_name(self, name):
        """Simple lookup into _name_to_rendering. Used in the per-face subset path."""
        return self._name_to_rendering.get(name)

    def get_rendering_from_geom_mat(self, ifc_geom_mat):
        """Resolves an IfcSurfaceStyleRendering from an ifcopenshell geometry material.

        ifcopenshell geometry materials have an original_name() that in Revit exports
        returns a string like 'IfcSurfaceStyleRendering-530219' (the IFC entity type
        and step-ID joined by a dash), not a human-readable material name.
        This method handles both cases:
          1. Try the name directly in _name_to_rendering (for standard IFC exports).
          2. Parse the entity ID from the name and look the entity up directly in the
             IFC file (for Revit exports where original_name() = entity type + ID).
        """
        name_fn = getattr(ifc_geom_mat, "original_name", None)
        mat_name = (
            name_fn() if callable(name_fn)
            else getattr(ifc_geom_mat, "name", None)
        ) or ""

        # 1. Human-readable name lookup (works for standard IFC exports)
        rendering = self._name_to_rendering.get(mat_name)
        if rendering is not None:
            return rendering

        # 2. Revit-style 'IfcEntityType-<step_id>' lookup
        #    original_name() returns e.g. 'IfcSurfaceStyleRendering-530219'
        if self._ifc_file is not None and '-' in mat_name:
            try:
                parts = mat_name.rsplit('-', 1)
                entity_id = int(parts[-1])
                entity = self._ifc_file.by_id(entity_id)
                if entity is not None:
                    if entity.is_a("IfcSurfaceStyleRendering"):
                        return entity
                    if entity.is_a("IfcSurfaceStyle"):
                        return _extract_rendering_from_surface_style(entity)
            except (ValueError, AttributeError, RuntimeError):
                pass

        return None

    # Step 7 — Unified material creator
    def create_usd_material_from_rendering(self, name, rendering=None):
        """Creates a USD PBR material from an IfcSurfaceStyleRendering (or defaults).

        Handles all IFC → USD attribute mappings defined in the plan:
          SurfaceColour     → diffuseColor (base)
          DiffuseColour     → diffuseColor (overrides/modulates)
          Transparency      → opacity = 1 − Transparency
          SpecularHighlight → roughness (floored at 0.35)
          ReflectanceMethod → metallic  (METAL/MIRROR → 1.0; MATT → roughness 1.0)

        Cache key is get_safe_name(name), so the same name always reuses one prim.
        """
        safe_name = get_safe_name(name)
        if safe_name in self.material_cache:
            return self.material_cache[safe_name]

        mat_path = self.look_path.AppendChild(safe_name)
        usd_mat = UsdShade.Material.Define(self.stage, mat_path)
        shader = UsdShade.Shader.Define(self.stage, mat_path.AppendChild("PBRShader"))
        shader.CreateIdAttr("UsdPreviewSurface")
        shader.GetPrim().CreateAttribute(
            "ifcMaterialName", Sdf.ValueTypeNames.String
        ).Set(
            # Use the real IfcMaterial.Name when available (resolves
            # Revit-style 'IfcSurfaceStyleRendering-530219' cache keys
            # back to the human-readable name like 'Iron, Cast').
            self._rendering_id_to_mat_name.get(rendering.id(), name)
            if rendering is not None else name
        )

        diffuse  = Gf.Vec3f(0.7, 0.7, 0.7)   # default grey
        opacity  = 1.0
        roughness = 0.8                         # default matte
        metallic  = 0.0

        if rendering is not None:
            # SurfaceColour — base diffuse
            try:
                c = rendering.SurfaceColour
                diffuse = Gf.Vec3f(float(c.Red), float(c.Green), float(c.Blue))
            except Exception:
                pass

            # DiffuseColour — overrides/modulates diffuse
            try:
                if rendering.DiffuseColour:
                    diffuse = _colour_or_factor_to_vec3(rendering.DiffuseColour, diffuse)
            except Exception:
                pass

            # Transparency → opacity
            try:
                if rendering.Transparency is not None:
                    opacity = max(0.0, min(1.0, 1.0 - float(rendering.Transparency)))
            except Exception:
                pass

            # SpecularHighlight → roughness (floored at 0.35)
            try:
                spec = rendering.SpecularHighlight
                if spec is not None:
                    spec_val = float(
                        spec.wrappedValue if hasattr(spec, "wrappedValue") else spec
                    )
                    spec_type = spec.is_a() if hasattr(spec, "is_a") else ""
                    if "Roughness" in spec_type:
                        roughness = max(0.35, min(1.0, spec_val))
                    elif "Exponent" in spec_type and spec_val > 0:
                        roughness = max(0.35, min(1.0, (2.0 / (spec_val + 2.0)) ** 0.5))
            except Exception:
                pass

            # ReflectanceMethod → metallic
            try:
                method = (
                    getattr(rendering, "ReflectanceMethod", "NOTDEFINED") or "NOTDEFINED"
                )
                if method in ("METAL", "MIRROR"):
                    metallic = 1.0
                elif method == "MATT":
                    roughness = 1.0
            except Exception:
                pass

        shader.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(diffuse)
        shader.CreateInput("opacity",      Sdf.ValueTypeNames.Float).Set(float(opacity))
        shader.CreateInput("roughness",    Sdf.ValueTypeNames.Float).Set(float(roughness))
        shader.CreateInput("metallic",     Sdf.ValueTypeNames.Float).Set(float(metallic))

        usd_mat.CreateSurfaceOutput().ConnectToSource(
            UsdShade.ConnectableAPI(shader), "surface"
        )
        self.material_cache[safe_name] = usd_mat
        return usd_mat


def extract_owner_data(element):
    """Extracts ownership info mapping strictly to your required schema."""
    data = {}
    history = getattr(element, "OwnerHistory", None)
    if history:
        data["changeAction"] = ensure_usd_compatible(getattr(history, "ChangeAction", ""))
        c_date = getattr(history, "CreationDate", None)
        data["creationDate"] = int(c_date) if c_date else int(time.time())

        app = getattr(history, "OwningApplication", None)
        if app:
            data["applicationName"] = ensure_usd_compatible(getattr(app, "ApplicationFullName", ""))
            data["applicationVersion"] = ensure_usd_compatible(getattr(app, "Version", ""))

        user = getattr(history, "OwningUser", None)
        if user:
            person = getattr(user, "ThePerson", None)
            if person:
                data["authorid"] = ensure_usd_compatible(getattr(person, "Identification", ""))
                first, last = getattr(person, 'GivenName', '') or '', getattr(person, 'FamilyName', '') or ''
                data["authorname"] = f"{first} {last}".strip()
            org = getattr(user, "TheOrganization", None)
            if org:
                data["organizationid"] = ensure_usd_compatible(getattr(org, "Identification", ""))
                data["organizationname"] = ensure_usd_compatible(getattr(org, "Name", ""))
            roles = getattr(user, "Roles", None)
            if roles:
                data["role"] = ", ".join([ensure_usd_compatible(r.Role) for r in roles if hasattr(r, 'Role')])
    return data

def get_relationship_data(element):
    """Scans inverse attributes for BIM connections (Voids, Containment, etc)."""
    rels = {}
    rel_map = {
        "HasOpenings": ("VoidedBy", "RelatedOpeningElement"),
        "FillsVoids": ("FillsOpening", "RelatingOpeningElement"),
        "ContainedInStructure": ("ContainedIn", "RelatingStructure"),
        "Decomposes": ("PartOf", "RelatingObject"),
        "IsDecomposedBy": ("ComposedOf", "RelatedObjects")
    }
    for attr, (role, target_attr) in rel_map.items():
        if hasattr(element, attr):
            try:
                attr_val = getattr(element, attr)
                if not attr_val: continue
                for rel_obj in (attr_val if isinstance(attr_val, (list, tuple)) else [attr_val]):
                    target = getattr(rel_obj, target_attr, None)
                    if target:
                        targets = target if isinstance(target, (list, tuple)) else [target]
                        for t in targets:
                            rels[f"{rel_obj.is_a()}_{t.GlobalId}"] = {
                                "Role": role, "Type": t.is_a(), "GlobalId": str(t.GlobalId)
                            }
            except: continue
    return rels

def get_classification_info(element):
    """Extracts classification references (OmniClass, UniFormat)."""
    classifications = {}
    try:
        if hasattr(element, "HasAssociations"):
            for assoc in element.HasAssociations:
                if assoc.is_a("IfcRelAssociatesClassification"):
                    ref = assoc.RelatingClassification
                    source_name = getattr(ref.ReferencedSource, "Name", "Unknown") if hasattr(ref, "ReferencedSource") else "Unknown"
                    classifications[ref.Identification or ref.Name] = {
                        "Source": ensure_usd_compatible(source_name),
                        "Name": ensure_usd_compatible(ref.Name),
                        "Identification": ensure_usd_compatible(ref.Identification)
                    }
    except: pass
    return classifications

def inject_metadata(prim, element):
    """Injects 'ifc', 'PropertySets', 'Relationships', and 'AssetInfo'."""
    ifc_class = element.is_a()
    attrs = IFC_METADATA_CONFIG.get(ifc_class, ["GlobalId", "Name"])

    # 1. 'ifc' Dictionary (Identity + Classifications)
    ifc_data = {}
    for a in attrs:
        if a in SKIP_LIST: continue
        try:
            val = getattr(element, a, None)
            if val: ifc_data[a] = ensure_usd_compatible(val)
        except: continue
    class_info = get_classification_info(element)
    if class_info: ifc_data["Classifications"] = class_info
    if ifc_data: prim.SetCustomDataByKey("ifc", ifc_data)

    # 2. 'PropertySets'
    property_sets = {}
    try:
        if hasattr(element, "IsDefinedBy"):
            for rel in element.IsDefinedBy:
                if rel.is_a('IfcRelDefinesByProperties'):
                    prop_def = rel.RelatingPropertyDefinition
                    if prop_def.is_a('IfcPropertySet'):
                        props = {p.Name: ensure_usd_compatible(p.NominalValue) for p in prop_def.HasProperties if hasattr(p, 'NominalValue')}
                        if props: property_sets[prop_def.Name] = props
    except: pass
    if property_sets: prim.SetCustomDataByKey("PropertySets", property_sets)

    # 3. 'Relationships'
    rel_data = get_relationship_data(element)
    if rel_data: prim.SetCustomDataByKey("Relationships", rel_data)

    # 4. ASSET INFO (Specific filtered list)
    owner = extract_owner_data(element)
    asset_fields = ["authorid", "authorname", "organizationid", "organizationname", "role"]
    asset_info = {k: v for k, v in owner.items() if k.lower() in asset_fields}
    if asset_info: prim.SetAssetInfo(asset_info)

def resolve_material_name(relating_material):
    """Returns a human-readable name string for any IFC material container type."""
    if relating_material is None:
        return "Default"

    entity_type = relating_material.is_a()

    if entity_type == "IfcMaterial":
        return relating_material.Name or "Default"

    if entity_type == "IfcMaterialList":
        names = []
        seen = set()
        for mat in (relating_material.Materials or []):
            n = getattr(mat, "Name", None) or "Unknown"
            if n not in seen:
                names.append(n)
                seen.add(n)
        return ", ".join(names) if names else "Default"

    if entity_type == "IfcMaterialLayerSetUsage":
        layer_set = getattr(relating_material, "ForLayerSet", None)
        return resolve_material_name(layer_set)

    if entity_type == "IfcMaterialLayerSet":
        set_name = getattr(relating_material, "LayerSetName", None)
        if set_name:
            return set_name
        names = []
        seen = set()
        for layer in (getattr(relating_material, "MaterialLayers", None) or []):
            mat = getattr(layer, "Material", None)
            n = (getattr(mat, "Name", None) if mat else None) or "Unknown"
            if n not in seen:
                names.append(n)
                seen.add(n)
        return ", ".join(names) if names else "Default"

    if entity_type == "IfcMaterialProfileSetUsage":
        profile_set = getattr(relating_material, "ForProfileSet", None)
        return resolve_material_name(profile_set)

    if entity_type == "IfcMaterialProfileSet":
        set_name = getattr(relating_material, "Name", None)
        if set_name:
            return set_name
        names = []
        seen = set()
        for profile in (getattr(relating_material, "MaterialProfiles", None) or []):
            mat = getattr(profile, "Material", None)
            n = (getattr(mat, "Name", None) if mat else None) or "Unknown"
            if n not in seen:
                names.append(n)
                seen.add(n)
        return ", ".join(names) if names else "Default"

    if entity_type == "IfcMaterialConstituentSet":
        set_name = getattr(relating_material, "Name", None)
        if set_name:
            return set_name
        names = []
        seen = set()
        for constituent in (getattr(relating_material, "MaterialConstituents", None) or []):
            mat = getattr(constituent, "Material", None)
            n = (getattr(mat, "Name", None) if mat else None) or "Unknown"
            if n not in seen:
                names.append(n)
                seen.add(n)
        return ", ".join(names) if names else "Default"

    return getattr(relating_material, "Name", None) or "Default"


def _get_element_type(element):
    """Returns the IfcTypeObject for an element.

    IFC4:  element.IsTypedBy  → IfcRelDefinesByType.RelatingType
    IFC2x3: element.IsDefinedBy (filtered to IfcRelDefinesByType) → RelatingType
    """
    for rel in (getattr(element, "IsTypedBy", None) or []):
        t = getattr(rel, "RelatingType", None)
        if t:
            return t
    for rel in (getattr(element, "IsDefinedBy", None) or []):
        if rel.is_a("IfcRelDefinesByType"):
            t = getattr(rel, "RelatingType", None)
            if t:
                return t
    return None


# Step 9 — Refactored process_element with single clean material flow
def process_element(stage, element, parent_path, settings, mat_manager):
    """Recursive hierarchy and geometry builder."""
    safe_name = get_safe_name(f"{element.is_a()}_{element.GlobalId}_{element.id()}")
    current_path = f"{parent_path}/{safe_name}"

    # 1. Create Xform prim and inject metadata
    usd_xform = UsdGeom.Xform.Define(stage, current_path)
    inject_metadata(usd_xform.GetPrim(), element)

    # IfcSpaces are deactivated by default (active = false) so they are
    # present in the hierarchy for BIM data purposes but invisible to
    # standard USD traversal / rendering.
    if element.is_a("IfcSpace"):
        usd_xform.GetPrim().SetActive(False)

    try:
        # 2. Tessellate geometry
        shape = ifcopenshell.geom.create_shape(settings, element)
        usd_mesh = UsdGeom.Mesh.Define(stage, f"{current_path}/Geometry")
        verts, faces = shape.geometry.verts, shape.geometry.faces
        usd_mesh.CreatePointsAttr(
            [Gf.Vec3f(verts[i], verts[i+1], verts[i+2]) for i in range(0, len(verts), 3)]
        )
        usd_mesh.CreateFaceVertexIndicesAttr(faces)
        usd_mesh.CreateFaceVertexCountsAttr([3] * (len(faces) // 3))

        # 3. Resolve material name from IfcRelAssociatesMaterial
        material_name = "Default"
        relating_material = None
        if hasattr(element, "HasAssociations"):
            for assoc in element.HasAssociations:
                if assoc.is_a("IfcRelAssociatesMaterial"):
                    relating_material = assoc.RelatingMaterial
                    material_name = resolve_material_name(relating_material)
                    break

        # Type-level fallback
        if relating_material is None:
            type_obj = _get_element_type(element)
            if type_obj and hasattr(type_obj, "HasAssociations"):
                for assoc in (type_obj.HasAssociations or []):
                    if assoc.is_a("IfcRelAssociatesMaterial"):
                        relating_material = assoc.RelatingMaterial
                        material_name = resolve_material_name(relating_material)
                        break

        # 4. Per-face subset path (if geo.material_ids available)
        bound_via_subsets = False
        try:
            geo = shape.geometry
            geo_mats   = list(getattr(geo, "materials",    None) or [])
            geo_mat_ids = list(getattr(geo, "material_ids", None) or [])

            if geo_mats and geo_mat_ids:
                face_groups = {}
                for fi, mid in enumerate(geo_mat_ids):
                    face_groups.setdefault(mid, []).append(fi)

                valid_groups = {
                    mid: idxs
                    for mid, idxs in face_groups.items()
                    if 0 <= mid < len(geo_mats)
                }

                if valid_groups:
                    for mid, face_indices in sorted(valid_groups.items()):
                        ifc_mat = geo_mats[mid]
                        name_fn  = getattr(ifc_mat, "original_name", None)
                        mat_name = (
                            name_fn() if callable(name_fn)
                            else getattr(ifc_mat, "name", None)
                        ) or f"mat_{mid}"

                        # Resolve rendering from the geometry material (handles both
                        # human-readable names and Revit 'IfcEntityType-ID' names)
                        rendering = mat_manager.get_rendering_from_geom_mat(ifc_mat)
                        usd_mat   = mat_manager.create_usd_material_from_rendering(
                            mat_name, rendering
                        )
                        subset_path = usd_mesh.GetPath().AppendChild(
                            get_safe_name(f"{mat_name}_{mid}")
                        )
                        subset = UsdGeom.Subset.Define(stage, subset_path)
                        subset.CreateElementTypeAttr().Set("face")
                        subset.CreateIndicesAttr(face_indices)
                        UsdShade.MaterialBindingAPI.Apply(subset.GetPrim()).Bind(usd_mat)
                    bound_via_subsets = True
        except Exception:
            pass

        # 5. Single-material path (no material_ids or subset path failed)
        if not bound_via_subsets:
            # Geometry-embedded rendering first (PRIMARY)
            rendering = mat_manager.get_rendering_from_element(element)
            # Fallback: look up from IfcMaterialDefinitionRepresentation chain
            if rendering is None:
                rendering = mat_manager.get_rendering_for_material(relating_material)
            usd_mat = mat_manager.create_usd_material_from_rendering(
                material_name, rendering
            )
            UsdShade.MaterialBindingAPI.Apply(usd_mesh.GetPrim()).Bind(usd_mat)

        # 6. Layer assignment metadata
        layer_data = get_layer_assignments_from_element(element)
        if layer_data:
            # USD SetCustomDataByKey requires VtDictionary-compatible types.
            # A Python list of dicts is an unregistered VtValue type and raises
            # warnings. Convert to a dict keyed by layer Name (or index fallback).
            layer_dict = {
                (entry.get("Name") or str(i)): entry
                for i, entry in enumerate(layer_data)
            }
            usd_xform.GetPrim().SetCustomDataByKey("PresentationLayers", layer_dict)

    except Exception as exc:
        exc_str = str(exc)
        if "Representation is NULL" not in exc_str and "'NoneType' object has no attribute 'geometry'" not in exc_str:
            report_progress(-1, f"[WARN] Geometry skipped for {element.is_a()} #{element.id()}: {exc}")

    # Recurse into children
    for rel_attr, target_attr in [
        ("ContainsElements", "RelatedElements"),
        ("IsDecomposedBy",   "RelatedObjects"),
    ]:
        if hasattr(element, rel_attr):
            try:
                for rel in getattr(element, rel_attr):
                    for item in getattr(rel, target_attr, []):
                        process_element(stage, item, current_path, settings, mat_manager)
            except: continue


def convert_ifc_to_usd(ifc_path, usd_path):
    report_progress(20, "Loading IFC File...")
    ifc_file = ifcopenshell.open(ifc_path)
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)

    if os.path.exists(usd_path):
        try: os.remove(usd_path)
        except OSError: return

    stage = Usd.Stage.CreateNew(usd_path)
    mat_manager = MaterialManager(stage, ifc_file)

    # --- Header Metadata (Global) ---
    projects = ifc_file.by_type("IfcProject")
    if projects:
        owner = extract_owner_data(projects[0])
        stage.GetRootLayer().customLayerData = {
            "applicationName":    owner.get("applicationName", ""),
            "applicationVersion": owner.get("applicationVersion", ""),
            "changeAction":       owner.get("changeAction", ""),
            "creationDate":       owner.get("creationDate", int(time.time())),
            "organizationName":   owner.get("organizationName", ""),
        }
        stage.GetRootLayer().documentation = f"Created by {owner.get('authorname', 'Unknown')}"

    UsdGeom.SetStageMetersPerUnit(stage, 1.0)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)

    if projects:
        report_progress(60, "Processing BIM Hierarchy...")
        process_element(stage, projects[0], "", settings, mat_manager)
        root_prim_path = f"/{get_safe_name(f'{projects[0].is_a()}_{projects[0].GlobalId}_{projects[0].id()}')}"
        stage.SetDefaultPrim(stage.GetPrimAtPath(root_prim_path))

    # Safety pass: process any IfcSpace elements that were not reachable
    # via the standard IsDecomposedBy / ContainsElements traversal from
    # IfcProject.  This covers spaces that lack a proper spatial container
    # or are only linked via non-standard relationships in some IFC exports.
    report_progress(80, "Processing IfcSpaces...")
    _visited_paths = {prim.GetPath().pathString for prim in stage.Traverse()}
    spaces_root = "/Spaces"
    _spaces_added = False
    for space in ifc_file.by_type("IfcSpace"):
        safe = get_safe_name(f"{space.is_a()}_{space.GlobalId}_{space.id()}")
        # Check if this space was already created anywhere in the stage
        already_exists = any(
            prim_path.endswith(safe)
            for prim_path in _visited_paths
        )
        if not already_exists:
            if not _spaces_added:
                UsdGeom.Scope.Define(stage, spaces_root)
                _spaces_added = True
            process_element(stage, space, spaces_root, settings, mat_manager)

    report_progress(100, "Done!")
    stage.GetRootLayer().Save()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    parser.add_argument('output')
    args = parser.parse_args()
    convert_ifc_to_usd(args.input, args.output)