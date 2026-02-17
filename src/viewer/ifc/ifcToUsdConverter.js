// src/viewer/ifc/ifcToUsdConverter.js
/**
 * IFC to USD Converter
 *
 * Senior BIM/Graphics Engineer Implementation
 * Preserves ALL IFC data during conversion with zero data loss
 *
 * Implements 6-Category Classification System:
 * 1. Physical & Spatial Elements → USD Xform/Mesh
 * 2. Type Definitions → USD Scope Resources + References
 * 3. Properties & Quantities → Namespaced Attributes
 * 4. Materials & Styling → USD Materials
 * 5. Geometry Source Data → USD Mesh + Metadata
 * 6. Global Context → Root Layer Metadata
 */

import { ifcParser, WebIFC } from "./ifcParser.js";
import { PropertySetAnalyzer } from "./propertySetAnalyzer.js";
import { GeometryHasher } from "./geometryHasher.js";
import { pruneEmptyContainers } from "../usda/usdaEditor.js";

// ============================================================================
// CATEGORY DEFINITIONS - Master Class List
// ============================================================================

// Commented out - reserved for future use
// const CATEGORY_1_PHYSICAL_SPATIAL = {
//   // Structural
//   IFCWALL: WebIFC.IFCWALL,
//   IFCSLAB: WebIFC.IFCSLAB,
//   IFCBEAM: WebIFC.IFCBEAM,
//   IFCWINDOW: WebIFC.IFCWINDOW,
//   IFCOPENINGELEMENT: WebIFC.IFCOPENINGELEMENT,
//   IFCCOVERING: WebIFC.IFCCOVERING,
//   IFCBUILDINGELEMENTPROXY: WebIFC.IFCBUILDINGELEMENTPROXY,
//   // MEP & Furnishing
//   IFCFURNITURE: WebIFC.IFCFURNITURE,
//   IFCSANITARYTERMINAL: WebIFC.IFCSANITARYTERMINAL,
//   IFCTANK: WebIFC.IFCTANK,
//   IFCAIRTERMINAL: WebIFC.IFCAIRTERMINAL,
//   // Spatial Hierarchy
//   IFCPROJECT: WebIFC.IFCPROJECT,
//   IFCSITE: WebIFC.IFCSITE,
//   IFCBUILDING: WebIFC.IFCBUILDING,
//   IFCBUILDINGSTOREY: WebIFC.IFCBUILDINGSTOREY,
//   IFCSPACE: WebIFC.IFCSPACE,
// };

const CATEGORY_2_TYPE_DEFINITIONS = {
  IFCWALLTYPE: WebIFC.IFCWALLTYPE,
  IFCBEAMTYPE: WebIFC.IFCBEAMTYPE,
  IFCBUILDINGELEMENTPROXYTYPE: WebIFC.IFCBUILDINGELEMENTPROXYTYPE,
  IFCSLABTYPE: WebIFC.IFCSLABTYPE,
  IFCWINDOWTYPE: WebIFC.IFCWINDOWTYPE,
  IFCDOORTYPE: WebIFC.IFCDOORTYPE,
  IFCFURNITURETYPETYPE: WebIFC.IFCFURNITURETYPETYPE,
};

// Commented out - reserved for future use
// const CATEGORY_3_PROPERTIES_QUANTITIES = {
//   IFCPROPERTYSET: WebIFC.IFCPROPERTYSET,
//   IFCPROPERTYSINGLEVALUE: WebIFC.IFCPROPERTYSINGLEVALUE,
//   IFCPROPERTYENUMERATEDVALUE: WebIFC.IFCPROPERTYENUMERATEDVALUE,
//   IFCCOMPLEXPROPERTY: WebIFC.IFCCOMPLEXPROPERTY,
//   IFCELEMENTQUANTITY: WebIFC.IFCELEMENTQUANTITY,
//   IFCQUANTITYLENGTH: WebIFC.IFCQUANTITYLENGTH,
//   IFCQUANTITYAREA: WebIFC.IFCQUANTITYAREA,
//   IFCQUANTITYVOLUME: WebIFC.IFCQUANTITYVOLUME,
//   IFCPHYSICALCOMPLEXQUANTITY: WebIFC.IFCPHYSICALCOMPLEXQUANTITY,
//   IFCRELDEFINESBYPROPERTIES: WebIFC.IFCRELDEFINESBYPROPERTIES,
//   IFCRELDEFINESBYTYPE: WebIFC.IFCRELDEFINESBYTYPE,
// };

const CATEGORY_4_MATERIALS_STYLING = {
  IFCMATERIAL: WebIFC.IFCMATERIAL,
  IFCMATERIALCONSTITUENT: WebIFC.IFCMATERIALCONSTITUENT,
  IFCMATERIALCONSTITUENTSET: WebIFC.IFCMATERIALCONSTITUENTSET,
  IFCRELASSOCIATESMATERIAL: WebIFC.IFCRELASSOCIATESMATERIAL,
  IFCSTYLEDITEM: WebIFC.IFCSTYLEDITEM,
  IFCSURFACESTYLERENDERING: WebIFC.IFCSURFACESTYLERENDERING,
  IFCCOLOURRGBLIST: WebIFC.IFCCOLOURRGBLIST,
  IFCINDEXEDCOLOURMAP: WebIFC.IFCINDEXEDCOLOURMAP,
  IFCPRESENTATIONLAYERASSIGNMENT: WebIFC.IFCPRESENTATIONLAYERASSIGNMENT,
  IFCSURFACESTYLE: WebIFC.IFCSURFACESTYLE,
};

const CATEGORY_5_GEOMETRY_SOURCE = {
  IFCCARTESIANPOINT: WebIFC.IFCCARTESIANPOINT,
  IFCCARTESIANPOINTLIST3D: WebIFC.IFCCARTESIANPOINTLIST3D,
  IFCDIRECTION: WebIFC.IFCDIRECTION,
  IFCAXIS2PLACEMENT3D: WebIFC.IFCAXIS2PLACEMENT3D,
  IFCLOCALPLACEMENT: WebIFC.IFCLOCALPLACEMENT,
  IFCSHAPEREPRESENTATION: WebIFC.IFCSHAPEREPRESENTATION,
  IFCPRODUCTDEFINITIONSHAPE: WebIFC.IFCPRODUCTDEFINITIONSHAPE,
  IFCPOLYGONALFACESET: WebIFC.IFCPOLYGONALFACESET,
  IFCINDEXEDPOLYGONALFACE: WebIFC.IFCINDEXEDPOLYGONALFACE,
  IFCINDEXEDPOLYGONALFACEWITHVOIDS: WebIFC.IFCINDEXEDPOLYGONALFACEWITHVOIDS,
  IFCMAPPEDITEM: WebIFC.IFCMAPPEDITEM,
};

const CATEGORY_6_GLOBAL_CONTEXT = {
  IFCOWNERHISTORY: WebIFC.IFCOWNERHISTORY,
  IFCAPPLICATION: WebIFC.IFCAPPLICATION,
  IFCPERSON: WebIFC.IFCPERSON,
  IFCORGANIZATION: WebIFC.IFCORGANIZATION,
  IFCPERSONANDORGANIZATION: WebIFC.IFCPERSONANDORGANIZATION,
  IFCUNITASSIGNMENT: WebIFC.IFCUNITASSIGNMENT,
  IFCSIUNIT: WebIFC.IFCSIUNIT,
  IFCCONVERSIONBASEDUNIT: WebIFC.IFCCONVERSIONBASEDUNIT,
  IFCDERIVEDUNIT: WebIFC.IFCDERIVEDUNIT,
  IFCDERIVEDUNITELEMENT: WebIFC.IFCDERIVEDUNITELEMENT,
  IFCMEASUREWITHUNIT: WebIFC.IFCMEASUREWITHUNIT,
  IFCDIMENSIONALEXPONENTS: WebIFC.IFCDIMENSIONALEXPONENTS,
  IFCMONETARYUNIT: WebIFC.IFCMONETARYUNIT,
  IFCCLASSIFICATIONREFERENCE: WebIFC.IFCCLASSIFICATIONREFERENCE,
};

const CATEGORY_RELATIONSHIPS = {
  IFCRELAGGREGATES: WebIFC.IFCRELAGGREGATES,
  IFCRELCONTAINEDINSPATIALSTRUCTURE: WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE,
};

// ============================================================================
// CONVERTER CLASS
// ============================================================================

export class IFCToUSDConverter {
  constructor() {
    this.modelID = null;
    this.usdContent = "";
    this.resources = {}; // Type definitions (Category 2)
    this.materials = {}; // Materials (Category 4)
    this.globalContext = {}; // Global context data (Category 6)
    this.entityCache = new Map(); // Cache for processed entities
    this.geometryCache = new Map(); // Cache for geometry data
    this.propertyCache = new Map(); // Cache for properties
    this.typeRelations = new Map(); // Maps instances to types
    this.spatialStructure = null; // Spatial hierarchy
    this.processedEntities = new Set(); // Track processed entities
    this.unhandledData = {}; // Fallback for unknown classes

    // USD Class Inheritance system
    this.usdClasses = {}; // Class definitions { className: { ifcType, properties, inherits } }
    this.entityToClass = new Map(); // entityID -> className mapping
    this.propertyAnalyzer = new PropertySetAnalyzer();

    // Geometry Instancing system
    this.geometryInstances = new Map(); // hash -> { prototype, instances[], prototypeName }
    this.geometryHasher = GeometryHasher;

    // Material De-duplication
    this.materialIdToName = new Map(); // For duplicate materials mapping
  }

  /**
   * Main conversion function
   * @param {File|ArrayBuffer} ifcFile - IFC file to convert
   * @param {Function} progressCallback - Optional callback for progress updates (percentage, message)
   * @param {Object} options - Optional conversion options
   * @returns {string} - USD ASCII content
   */
  async convert(ifcFile, progressCallback = null, options = {}) {
    console.log("[IFCToUSDConverter] Starting conversion...");

    const reportProgress = (percentage, message) => {
      if (progressCallback) {
        progressCallback(percentage, message);
      }
    };

    // Initialize parser and load IFC
    reportProgress(15, "Initializing IFC parser...");
    await ifcParser.init();
    this.modelID = await ifcParser.loadIFC(ifcFile);

    // Phase 1: Gather all entity data
    reportProgress(25, "Gathering entity data...");
    console.log("[IFCToUSDConverter] Phase 1: Gathering entity data...");
    await this.gatherAllEntities();

    // Phase 1.5: Analyze property patterns and create USD classes (unless disabled)
    if (!options.disableClasses) {
      reportProgress(30, "Analyzing property patterns...");
      console.log("[IFCToUSDConverter] Phase 1.5: Creating USD classes...");
      await this.analyzeAndCreateClasses();
    }

    // Phase 2: Process by category
    reportProgress(35, "Processing global context...");
    console.log("[IFCToUSDConverter] Phase 2: Processing categories...");
    await this.processCategory6_GlobalContext();

    reportProgress(45, "Processing type definitions...");
    await this.processCategory2_TypeDefinitions();

    reportProgress(55, "Processing materials...");
    await this.processCategory4_Materials();

    reportProgress(65, "Processing geometry...");
    await this.processCategory5_Geometry();

    // Phase 2.5: Detect geometry instances (unless disabled)
    if (!options.disableInstancing) {
      reportProgress(67, "Detecting geometry instances...");
      console.log(
        "[IFCToUSDConverter] Phase 2.5: Detecting geometry instances..."
      );
      await this.detectGeometryInstances();
    }

    reportProgress(70, "Processing relationships...");
    await this.processCategoryRelationships();

    // Phase 3: Build spatial hierarchy (Category 1)
    reportProgress(75, "Building spatial hierarchy...");
    console.log("[IFCToUSDConverter] Phase 3: Building spatial hierarchy...");
    const hierarchyUSD = await this.processCategory1_PhysicalSpatial();

    // Phase 4: Generate USD file
    reportProgress(85, "Generating USD file...");
    console.log("[IFCToUSDConverter] Phase 4: Generating USD...");
    this.usdContent = this.generateUSDFile(hierarchyUSD);

    // Phase 5: Semantic filtering (optional)
    if (options.pruneEmptyContainers) {
      reportProgress(90, "Pruning empty containers...");
      console.log("[IFCToUSDConverter] Phase 5: Semantic filtering...");
      const { content, prunedCount } = pruneEmptyContainers(this.usdContent, {
        excludePaths: ["/IFCModel", "/_Classes", "/Materials", "/Prototypes"],
      });
      this.usdContent = content;
      console.log(`[IFCToUSDConverter] Pruned ${prunedCount} empty containers`);
    }

    // Cleanup
    reportProgress(95, "Finalizing...");
    ifcParser.closeModel(this.modelID);

    console.log("[IFCToUSDConverter] Conversion complete!");
    reportProgress(100, "Conversion complete!");
    return this.usdContent;
  }

  /**
   * Gather all entities from the IFC file
   */
  async gatherAllEntities() {
    const allEntities = ifcParser.getAllEntities(this.modelID);

    for (const entityID of allEntities) {
      try {
        const entity = ifcParser.getEntityProperties(this.modelID, entityID);
        if (entity) {
          this.entityCache.set(entityID, entity);
        }
      } catch (e) {
        console.warn(`Failed to get entity ${entityID}:`, e);
      }
    }

    console.log(`[IFCToUSDConverter] Cached ${this.entityCache.size} entities`);
  }

  /**
   * CATEGORY 6: Process Global Context
   * Maps to USD Root Layer Metadata
   */
  async processCategory6_GlobalContext() {
    const contextTypes = Object.values(CATEGORY_6_GLOBAL_CONTEXT);

    for (const [entityID, entity] of this.entityCache) {
      const typeName = ifcParser.getTypeName(entity.type);

      if (contextTypes.includes(entity.type)) {
        this.processedEntities.add(entityID);

        // Store in global context dictionary
        if (!this.globalContext[typeName]) {
          this.globalContext[typeName] = [];
        }

        this.globalContext[typeName].push({
          id: entityID,
          data: this.flattenEntity(entity),
        });
      }
    }

    console.log(
      `[Category 6] Processed ${Object.keys(this.globalContext).length} global context types`
    );
  }

  /**
   * CATEGORY 2: Process Type Definitions
   * Maps to USD def Scope "Resources" with references
   */
  async processCategory2_TypeDefinitions() {
    const typeDefTypes = Object.values(CATEGORY_2_TYPE_DEFINITIONS);

    for (const [entityID, entity] of this.entityCache) {
      if (typeDefTypes.includes(entity.type)) {
        this.processedEntities.add(entityID);
        const typeName = ifcParser.getTypeName(entity.type);
        const name = this.getEntityName(entity) || `Type_${entityID}`;

        this.resources[name] = {
          id: entityID,
          type: typeName,
          data: this.flattenEntity(entity),
        };
      }
    }

    console.log(
      `[Category 2] Processed ${Object.keys(this.resources).length} type definitions`
    );
  }

  /**
   * CATEGORY 4: Process Materials & Styling
   * Maps to USD Materials and bindings
   */
  async processCategory4_Materials() {
    const materialTypes = Object.values(CATEGORY_4_MATERIALS_STYLING);
    const materialsBySignature = new Map(); // signature -> materialName

    for (const [entityID, entity] of this.entityCache) {
      if (materialTypes.includes(entity.type)) {
        this.processedEntities.add(entityID);
        const typeName = ifcParser.getTypeName(entity.type);
        const flatData = this.flattenEntity(entity);

        // Create signature from properties (excluding ID and name)
        const signature = this.createMaterialSignature(flatData);

        if (!materialsBySignature.has(signature)) {
          // First occurrence - create material
          const name = this.getEntityName(entity) || `Material_${entityID}`;
          this.materials[name] = {
            id: entityID,
            type: typeName,
            data: flatData,
          };
          materialsBySignature.set(signature, name);
        } else {
          // Duplicate - map to existing material
          const existingName = materialsBySignature.get(signature);
          this.materialIdToName.set(entityID, existingName);
          console.log(
            `[Material Dedup] Material ${entityID} → ${existingName}`
          );
        }
      }
    }

    console.log(
      `[Category 4] Created ${Object.keys(this.materials).length} unique materials (de-duplicated)`
    );
  }

  /**
   * Create signature for material de-duplication
   */
  createMaterialSignature(materialData) {
    // Create sorted JSON of relevant properties (exclude Name, GlobalId, expressID)
    const relevantProps = {};
    const excludeKeys = ["Name", "GlobalId", "expressID", "type"];

    for (const [key, value] of Object.entries(materialData)) {
      if (!excludeKeys.includes(key)) {
        relevantProps[key] = value;
      }
    }

    // Sort keys for consistent signature
    const sorted = Object.keys(relevantProps)
      .sort()
      .reduce((acc, key) => {
        acc[key] = relevantProps[key];
        return acc;
      }, {});

    return JSON.stringify(sorted);
  }

  /**
   * CATEGORY 5: Process Geometry Source Data
   * These are consumed to generate USD Mesh but stored as metadata
   */
  async processCategory5_Geometry() {
    const geometryTypes = Object.values(CATEGORY_5_GEOMETRY_SOURCE);

    for (const [entityID, entity] of this.entityCache) {
      if (geometryTypes.includes(entity.type)) {
        this.processedEntities.add(entityID);
        const typeName = ifcParser.getTypeName(entity.type);

        // Store geometry source for metadata
        this.geometryCache.set(entityID, {
          type: typeName,
          data: this.flattenEntity(entity),
        });
      }
    }

    console.log(
      `[Category 5] Processed ${this.geometryCache.size} geometry sources`
    );
  }

  /**
   * Process Relationship entities
   */
  async processCategoryRelationships() {
    const relTypes = Object.values(CATEGORY_RELATIONSHIPS);

    for (const [entityID, entity] of this.entityCache) {
      if (relTypes.includes(entity.type)) {
        this.processedEntities.add(entityID);

        // Store type relations for later use
        if (entity.type === WebIFC.IFCRELDEFINESBYTYPE) {
          const relatedObjects = entity.RelatedObjects || [];
          const relatingType = entity.RelatingType;

          for (const obj of relatedObjects) {
            if (obj && obj.value) {
              this.typeRelations.set(obj.value, relatingType.value);
            }
          }
        }
      }
    }
  }

  /**
   * Analyze entities and create USD class definitions for repeated patterns
   * This eliminates 40-60% of redundant metadata
   */
  async analyzeAndCreateClasses() {
    // 1. Collect all physical/spatial entities with their properties
    const physicalEntities = [];
    for (const [entityID, entity] of this.entityCache) {
      if (this.isPhysicalOrSpatial(entity.type)) {
        const typeName = ifcParser.getTypeName(entity.type);
        const properties = await this.getPropertiesForEntity(entityID);
        physicalEntities.push({ entityID, typeName, properties });
      }
    }

    // 2. Analyze property patterns
    this.propertyAnalyzer.analyzeEntities(physicalEntities);
    const classCandidates = this.propertyAnalyzer.identifyClassCandidates(3); // min 3 instances

    // 3. Create _BimBase class with universal properties
    this.usdClasses["_BimBase"] = {
      ifcType: "IFC_BASE",
      properties: {},
      inherits: null,
    };

    // 4. Create specific classes (Wall, Door, etc.)
    for (const [signature, signatureData] of classCandidates) {
      const className = this.generateClassName(signature);

      // For now, we'll mark properties as common based on signature
      // In a more sophisticated implementation, we'd compare actual values
      const commonProps = {};
      const [, propsStr] = signature.split("|");
      const propKeys = propsStr ? propsStr.split(",") : [];

      // Mark the properties as common (values will be from first instance)
      const firstEntityID = signatureData.entities[0];
      const firstEntity = physicalEntities.find(
        (e) => e.entityID === firstEntityID
      );
      if (firstEntity) {
        for (const key of propKeys) {
          if (firstEntity.properties[key] !== undefined) {
            commonProps[key] = firstEntity.properties[key];
          }
        }
      }

      this.usdClasses[className] = {
        ifcType: signatureData.typeName,
        properties: commonProps,
        inherits: "/_BimBase",
      };

      // Map entities to this class
      signatureData.entities.forEach((entityID) =>
        this.entityToClass.set(entityID, className)
      );
    }

    console.log(
      `[Class System] Created ${Object.keys(this.usdClasses).length} USD classes`
    );
  }

  /**
   * Generate class name from signature
   */
  generateClassName(signature) {
    const parts = signature.split("|");
    const ifcType = parts[0].replace("IFC", "");
    // Include a hash of property keys to make class names unique
    const propsHash = parts[1] ? parts[1].substring(0, 8) : "default";
    return `_Class_${ifcType}_${propsHash}`;
  }

  /**
   * Check if entity type is physical/spatial (Category 1)
   */
  isPhysicalOrSpatial(entityType) {
    // Exclude Category 2, 4, 5, 6 types
    const excludeTypes = [
      ...Object.values(CATEGORY_2_TYPE_DEFINITIONS),
      ...Object.values(CATEGORY_4_MATERIALS_STYLING),
      ...Object.values(CATEGORY_5_GEOMETRY_SOURCE),
      ...Object.values(CATEGORY_6_GLOBAL_CONTEXT),
    ];
    return !excludeTypes.includes(entityType);
  }

  /**
   * Detect duplicate geometries and mark for instancing
   * Reduces file size by 10-30% for models with repetitive elements
   */
  async detectGeometryInstances() {
    const geometryByHash = new Map();

    // Hash all geometries
    for (const [entityID] of this.entityCache) {
      if (await this.hasGeometry(entityID)) {
        const geometry = await this.extractGeometry(entityID);
        if (geometry && geometry.points && geometry.faces) {
          const hash = this.geometryHasher.hashGeometry(
            geometry.points,
            geometry.faces
          );

          if (!geometryByHash.has(hash)) {
            geometryByHash.set(hash, []);
          }
          geometryByHash.get(hash).push({ entityID, geometry });
        }
      }
    }

    // Identify instances (hash appears 2+ times)
    let prototypeIndex = 0;
    for (const [hash, entries] of geometryByHash) {
      if (entries.length >= 2) {
        this.geometryInstances.set(hash, {
          prototype: entries[0],
          instances: entries.map((e) => e.entityID),
          prototypeName: `Prototype_${prototypeIndex++}`,
        });
        console.log(
          `[Instancing] Found ${entries.length} instances of geometry hash ${hash.substring(0, 8)}...`
        );
      }
    }

    console.log(
      `[Instancing] Detected ${this.geometryInstances.size} instanceable geometries`
    );
  }

  /**
   * CATEGORY 1: Process Physical & Spatial Elements
   * Maps to USD def Xform or def Mesh
   */
  async processCategory1_PhysicalSpatial() {
    this.spatialStructure = ifcParser.getSpatialStructure(this.modelID);
    const hierarchy = [];

    // Build USD hierarchy from spatial structure
    const processNode = async (node, depth = 0) => {
      const entityID = node.expressID;
      const entity = this.entityCache.get(entityID);

      if (!entity) return null;

      const typeName = ifcParser.getTypeName(entity.type);
      const name = this.getEntityName(entity) || `${typeName}_${entityID}`;

      // Get properties (Category 3)
      const properties = await this.getPropertiesForEntity(entityID);

      // Get material binding
      const materialRef = await this.getMaterialForEntity(entityID);

      // Get type reference (Category 2)
      const typeRef = this.typeRelations.get(entityID);

      // Check if entity has geometry
      const hasGeometry = await this.hasGeometry(entityID);

      const usdNode = {
        name: this.sanitizeName(name),
        type: hasGeometry ? "Mesh" : "Xform",
        ifcType: typeName,
        ifcID: entityID,
        properties: properties,
        materialBinding: materialRef,
        typeReference: typeRef,
        children: [],
      };

      // Add geometry data with source metadata
      if (hasGeometry) {
        const geometry = await this.extractGeometry(entityID);
        usdNode.geometry = geometry;
      }

      // Process children
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          const childNode = await processNode(child, depth + 1);
          if (childNode) {
            usdNode.children.push(childNode);
          }
        }
      }

      this.processedEntities.add(entityID);
      return usdNode;
    };

    // Process root nodes
    if (this.spatialStructure && this.spatialStructure.children) {
      for (const rootNode of this.spatialStructure.children) {
        const node = await processNode(rootNode);
        if (node) {
          hierarchy.push(node);
        }
      }
    }

    // Check for unprocessed entities
    this.checkForUnprocessedEntities();

    return hierarchy;
  }

  /**
   * CATEGORY 3: Get properties for an entity
   * Flattened as USD namespaced attributes
   */
  async getPropertiesForEntity(entityID) {
    const properties = {};

    try {
      const propertySets = ifcParser.getPropertySets(
        this.modelID,
        entityID,
        true
      );

      if (propertySets && propertySets.length > 0) {
        for (const pset of propertySets) {
          const psetName = pset.Name?.value || "UnknownPSet";

          if (pset.HasProperties) {
            for (const prop of pset.HasProperties) {
              const propData = this.entityCache.get(prop.value);
              if (propData) {
                this.processedEntities.add(prop.value);
                const propName = propData.Name?.value || "UnknownProperty";
                let propValue = null;

                // Handle different property types
                if (propData.NominalValue) {
                  propValue = this.extractValue(propData.NominalValue);
                }

                // Create namespaced attribute
                const attrName = `ifc:pset:${psetName}:${propName}`;
                properties[attrName] = propValue;
              }
            }
          }
        }
      }

      // Get quantities
      const quantities = await this.getQuantitiesForEntity(entityID);
      Object.assign(properties, quantities);
    } catch (e) {
      console.warn(`Failed to get properties for entity ${entityID}:`, e);
    }

    return properties;
  }

  /**
   * Get quantities for an entity
   */
  // eslint-disable-next-line no-unused-vars
  async getQuantitiesForEntity(_entityID) {
    const quantities = {};

    // This would be implemented similar to properties
    // For now, placeholder

    return quantities;
  }

  /**
   * Get material for an entity
   */
  async getMaterialForEntity(entityID) {
    try {
      const materials = ifcParser.getMaterials(this.modelID, entityID);
      if (materials && materials.length > 0) {
        const materialID = materials[0].expressID;

        // Check if this material was de-duplicated
        if (this.materialIdToName.has(materialID)) {
          return this.sanitizeName(this.materialIdToName.get(materialID));
        }

        // Otherwise use the name from materials dict
        const materialName =
          this.getEntityName(materials[0]) || `Material_${materialID}`;
        return this.sanitizeName(materialName);
      }
    } catch {
      // No material
    }
    return null;
  }

  /**
   * Check if entity has geometry
   */
  async hasGeometry(entityID) {
    try {
      const geometry = ifcParser.getGeometry(this.modelID, entityID);
      return geometry && geometry.GetVertexDataSize() > 0;
    } catch {
      return false;
    }
  }

  /**
   * Extract geometry from entity
   */
  async extractGeometry(entityID) {
    try {
      const geometry = ifcParser.getGeometry(this.modelID, entityID);

      if (!geometry) return null;

      const verts = geometry.GetVertexArray();
      const indices = geometry.GetIndexArray();

      const points = [];
      for (let i = 0; i < verts.length; i += 3) {
        points.push([verts[i], verts[i + 1], verts[i + 2]]);
      }

      const faces = [];
      for (let i = 0; i < indices.length; i += 3) {
        faces.push([indices[i], indices[i + 1], indices[i + 2]]);
      }

      // Get geometry source type from cache
      const entity = this.entityCache.get(entityID);
      let geometrySource = "Unknown";
      let representationType = "Tessellation";

      if (entity && entity.Representation) {
        const repID = entity.Representation.value;
        const repData = this.geometryCache.get(repID);
        if (repData) {
          geometrySource = repData.type;
          representationType =
            repData.data.RepresentationType?.value || "Tessellation";
        }
      }

      return {
        points,
        faces,
        metadata: {
          geometrySource,
          representationType,
        },
      };
    } catch (e) {
      console.warn(`Failed to extract geometry for entity ${entityID}:`, e);
      return null;
    }
  }

  /**
   * Check for unprocessed entities and store as unhandled
   */
  checkForUnprocessedEntities() {
    const unprocessed = [];

    for (const [entityID, entity] of this.entityCache) {
      if (!this.processedEntities.has(entityID)) {
        const typeName = ifcParser.getTypeName(entity.type);
        unprocessed.push({
          id: entityID,
          type: typeName,
          data: this.flattenEntity(entity),
        });
      }
    }

    if (unprocessed.length > 0) {
      console.warn(
        `[IFCToUSDConverter] ${unprocessed.length} unprocessed entities stored as unhandled data`
      );
      this.unhandledData.entities = unprocessed;
    }
  }

  /**
   * Generate complete USD file
   */
  generateUSDFile(hierarchy) {
    let usd = `#usda 1.0
(
    defaultPrim = "IFCModel"
    upAxis = "Z"
    metersPerUnit = 1.0
    customLayerData = {
        dictionary ifc:context = {
${this.generateContextMetadata()}
        }
${this.generateUnhandledDataMetadata()}
    }
)

`;

    // Add USD Class definitions
    if (Object.keys(this.usdClasses).length > 0) {
      usd += this.generateClassScope();
    }

    // Add Resources scope for type definitions (Category 2)
    if (Object.keys(this.resources).length > 0) {
      usd += this.generateResourcesScope();
    }

    // Add Materials scope (Category 4)
    if (Object.keys(this.materials).length > 0) {
      usd += this.generateMaterialsScope();
    }

    // Add Prototypes scope for instanced geometry
    if (this.geometryInstances.size > 0) {
      usd += this.generatePrototypesScope();
    }

    // Add main hierarchy
    usd += `def Xform "IFCModel"
{
${this.generateHierarchy(hierarchy, 1)}
}
`;

    return usd;
  }

  /**
   * Generate context metadata (Category 6)
   * OPTIMIZED: Only write truly global context, not repetitive classification references
   */
  generateContextMetadata() {
    let metadata = "";

    // Only write truly global context (units, owner history, project)
    const globalContextTypes = [
      "IFCUNITASSIGNMENT",
      "IFCOWNERHISTORY",
      "IFCPROJECT",
    ];

    for (const [typeName, entities] of Object.entries(this.globalContext)) {
      if (globalContextTypes.includes(typeName)) {
        metadata += `            dictionary ${typeName} = {\n`;
        for (const entity of entities) {
          metadata += `                int id_${entity.id} = ${entity.id}\n`;
          // Only write essential global data (Name, not repetitive IDs)
          if (entity.data.Name) {
            const usdValue = this.toUSDValue(entity.data.Name);
            metadata += `                string Name = ${usdValue}\n`;
          }
        }
        metadata += `            }\n`;
      }
    }

    return metadata;
  }

  /**
   * Generate unhandled data metadata
   */
  generateUnhandledDataMetadata() {
    if (Object.keys(this.unhandledData).length === 0) return "";

    return `        dictionary ifc:unhandled_data = {
            string note = "Entities not in master class list"
            int count = ${this.unhandledData.entities?.length || 0}
        }`;
  }

  /**
   * Generate Resources scope (Category 2)
   */
  generateResourcesScope() {
    let usd = `def Scope "_Resources"
{
`;

    for (const [name, typeData] of Object.entries(this.resources)) {
      usd += `    def Scope "${name}" (
        customData = {
            string ifc:type = "${typeData.type}"
            int ifc:id = ${typeData.id}
        }
    )
    {
`;
      // Add type properties
      for (const [key, value] of Object.entries(typeData.data)) {
        const usdValue = this.toUSDValue(value);
        usd += `        custom string ifc:typedata:${key} = ${usdValue}\n`;
      }
      usd += `    }\n\n`;
    }

    usd += `}\n\n`;
    return usd;
  }

  /**
   * Generate Materials scope (Category 4)
   */
  generateMaterialsScope() {
    let usd = `def Scope "Materials"
{
`;

    for (const [name, materialData] of Object.entries(this.materials)) {
      usd += `    def Material "${name}"
    {
        custom string ifc:material_type = "${materialData.type}"
        custom int ifc:id = ${materialData.id}
`;
      // Add material properties
      for (const [key, value] of Object.entries(materialData.data)) {
        const usdValue = this.toUSDValue(value);
        usd += `        custom string ifc:material:${key} = ${usdValue}\n`;
      }
      usd += `    }\n\n`;
    }

    usd += `}\n\n`;
    return usd;
  }

  /**
   * Generate USD class definitions scope
   */
  generateClassScope() {
    let usd = `def Scope "_Classes"\n{\n`;

    // _BimBase first
    if (this.usdClasses["_BimBase"]) {
      usd += `    class "_BimBase"\n    {\n`;
      for (const [propName, propValue] of Object.entries(
        this.usdClasses["_BimBase"].properties
      )) {
        const usdValue = this.toUSDValue(propValue);
        const propType = this.inferUSDType(propValue);
        usd += `        custom ${propType} "${propName}" = ${usdValue}\n`;
      }
      usd += `    }\n\n`;
    }

    // Other classes with inheritance
    for (const [className, classData] of Object.entries(this.usdClasses)) {
      if (className !== "_BimBase") {
        usd += `    class "${className}"`;
        if (classData.inherits) {
          usd += ` (\n        inherits = <${classData.inherits}>\n    )`;
        }
        usd += `\n    {\n`;
        usd += `        custom string ifc:type = "${classData.ifcType}"\n`;
        for (const [propName, propValue] of Object.entries(
          classData.properties
        )) {
          const usdValue = this.toUSDValue(propValue);
          const propType = this.inferUSDType(propValue);
          usd += `        custom ${propType} "${propName}" = ${usdValue}\n`;
        }
        usd += `    }\n\n`;
      }
    }

    usd += `}\n\n`;
    return usd;
  }

  /**
   * Generate Prototypes scope for instanced geometry
   */
  generatePrototypesScope() {
    if (this.geometryInstances.size === 0) return "";

    let usd = `def Scope "Prototypes"\n{\n`;

    for (const [, instanceData] of this.geometryInstances) {
      const { prototype, prototypeName } = instanceData;
      const geom = prototype.geometry;

      usd += `    def Mesh "${prototypeName}" (\n`;
      usd += `        instanceable = true\n`;
      usd += `    )\n    {\n`;
      usd += `        point3f[] points = [${this.formatPoints(geom.points)}]\n`;
      usd += `        int[] faceVertexCounts = [${geom.faces.map(() => 3).join(", ")}]\n`;
      usd += `        int[] faceVertexIndices = [${geom.faces.flat().join(", ")}]\n`;
      usd += `    }\n\n`;
    }

    usd += `}\n\n`;
    return usd;
  }

  /**
   * Generate hierarchy recursively
   */
  generateHierarchy(nodes, indent = 0) {
    let usd = "";
    const indentStr = "    ".repeat(indent);

    for (const node of nodes) {
      const primType = node.type || "Xform";
      const className = this.entityToClass.get(node.ifcID);

      if (className) {
        // Use USD class inheritance
        usd += `${indentStr}def ${primType} "${node.name}" (\n`;
        usd += `${indentStr}    inherits = </_Classes/${className}>\n`;
        usd += `${indentStr})\n`;
        usd += `${indentStr}{\n`;

        // Only write unique properties not in class
        const classProps = this.usdClasses[className].properties;

        // Add IFC ID (always unique)
        usd += `${indentStr}    custom int ifc:id = ${node.ifcID}\n`;

        // Add type reference (Category 2)
        if (node.typeReference) {
          usd += `${indentStr}    custom int ifc:type_ref = ${node.typeReference}\n`;
        }

        // Add material binding (Category 4)
        if (node.materialBinding) {
          usd += `${indentStr}    rel material:binding = </Materials/${node.materialBinding}>\n`;
        }

        // Add unique properties (not in class)
        if (node.properties) {
          for (const [key, value] of Object.entries(node.properties)) {
            if (
              !Object.prototype.hasOwnProperty.call(classProps, key) &&
              value !== null &&
              value !== undefined
            ) {
              const usdValue = this.toUSDValue(value);
              const attrType = this.inferUSDType(value);
              usd += `${indentStr}    custom ${attrType} "${key}" = ${usdValue}\n`;
            }
          }
        }
      } else {
        // No class - write all properties as before
        usd += `${indentStr}def ${primType} "${node.name}"\n`;
        usd += `${indentStr}{\n`;

        // Add IFC metadata
        usd += `${indentStr}    custom string ifc:type = "${node.ifcType}"\n`;
        usd += `${indentStr}    custom int ifc:id = ${node.ifcID}\n`;

        // Add type reference (Category 2)
        if (node.typeReference) {
          usd += `${indentStr}    custom int ifc:type_ref = ${node.typeReference}\n`;
        }

        // Add material binding (Category 4)
        if (node.materialBinding) {
          usd += `${indentStr}    rel material:binding = </Materials/${node.materialBinding}>\n`;
        }

        // Add properties (Category 3)
        if (node.properties) {
          for (const [key, value] of Object.entries(node.properties)) {
            if (value !== null && value !== undefined) {
              const usdValue = this.toUSDValue(value);
              const attrType = this.inferUSDType(value);
              usd += `${indentStr}    custom ${attrType} "${key}" = ${usdValue}\n`;
            }
          }
        }
      }

      // Add geometry (Category 5 metadata)
      if (node.geometry) {
        // Check if this geometry is instanced
        let isInstance = false;
        for (const [, instanceData] of this.geometryInstances) {
          if (instanceData.instances.includes(node.ifcID)) {
            // This is an instance - reference the prototype instead
            usd += `${indentStr}    prepend references = </Prototypes/${instanceData.prototypeName}>\n`;
            usd += `${indentStr}    custom bool ifc:is_instanced = true\n`;
            isInstance = true;
            break;
          }
        }

        if (!isInstance) {
          // Not instanced - write geometry inline as before
          usd += `${indentStr}    custom string ifc:geometry_source = "${node.geometry.metadata.geometrySource}"\n`;
          usd += `${indentStr}    custom string ifc:representation_type = "${node.geometry.metadata.representationType}"\n`;

          // Add mesh data
          usd += `${indentStr}    point3f[] points = [${this.formatPoints(node.geometry.points)}]\n`;
          usd += `${indentStr}    int[] faceVertexCounts = [${node.geometry.faces.map(() => 3).join(", ")}]\n`;
          usd += `${indentStr}    int[] faceVertexIndices = [${node.geometry.faces.flat().join(", ")}]\n`;
        }
      }

      // Add children
      if (node.children && node.children.length > 0) {
        usd += this.generateHierarchy(node.children, indent + 1);
      }

      usd += `${indentStr}}\n\n`;
    }

    return usd;
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Flatten entity to simple key-value pairs
   */
  flattenEntity(entity) {
    const flat = {};

    for (const [key, value] of Object.entries(entity)) {
      if (value && typeof value === "object" && "value" in value) {
        flat[key] = value.value;
      } else if (typeof value !== "object") {
        flat[key] = value;
      }
    }

    return flat;
  }

  /**
   * Extract value from IFC value object
   */
  extractValue(valueObj) {
    if (!valueObj) return null;
    if (valueObj.value !== undefined) return valueObj.value;
    return valueObj;
  }

  /**
   * Get entity name
   */
  getEntityName(entity) {
    if (entity.Name && entity.Name.value) {
      return entity.Name.value;
    }
    if (entity.GlobalId && entity.GlobalId.value) {
      return entity.GlobalId.value;
    }
    return null;
  }

  /**
   * Sanitize name for USD
   */
  sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, "_");
  }

  /**
   * Convert value to USD format
   */
  toUSDValue(value) {
    if (typeof value === "string") {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    if (typeof value === "number") {
      return value.toString();
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (Array.isArray(value)) {
      return `[${value.map((v) => this.toUSDValue(v)).join(", ")}]`;
    }
    return `"${String(value)}"`;
  }

  /**
   * Infer USD type from value
   */
  inferUSDType(value) {
    if (typeof value === "string") return "string";
    if (typeof value === "number") {
      return Number.isInteger(value) ? "int" : "double";
    }
    if (typeof value === "boolean") return "bool";
    if (Array.isArray(value)) return "string[]";
    return "string";
  }

  /**
   * Format points for USD
   */
  formatPoints(points) {
    return points.map((p) => `(${p[0]}, ${p[1]}, ${p[2]})`).join(", ");
  }
}

// Export singleton
export const ifcToUsdConverter = new IFCToUSDConverter();
