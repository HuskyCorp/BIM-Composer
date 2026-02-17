import ifcopenshell
import ifcopenshell.geom
from pxr import Usd, UsdGeom, Sdf, Gf
import os
import sys
import json
import argparse

def report_progress(percentage, message):
    """Output progress as JSON for Node.js to parse"""
    progress_data = {
        "type": "progress",
        "percentage": percentage,
        "message": message
    }
    print(json.dumps(progress_data), flush=True)

def convert_ifc_to_usd(ifc_path, usd_path):
    report_progress(0, "Starting conversion...")

    # 1. Initialize the IFC Geometry Engine
    # USE_WORLD_COORDS ensures everything is placed correctly in 3D space
    report_progress(10, "Initializing IFC geometry engine...")
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)

    try:
        report_progress(20, "Opening IFC file...")
        ifc_file = ifcopenshell.open(ifc_path)
    except Exception as e:
        error_data = {
            "type": "error",
            "message": f"Error opening IFC: {e}"
        }
        print(json.dumps(error_data), flush=True)
        return

    # 2. Create the USD Stage
    report_progress(30, "Creating USD stage...")
    if os.path.exists(usd_path):
        os.remove(usd_path) # Clear existing file

    stage = Usd.Stage.CreateNew(usd_path)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z) # BIM is Z-Up

    # Create a root folder for geometry
    root_prim = UsdGeom.Xform.Define(stage, "/World")
    stage.SetDefaultPrim(root_prim.GetPrim())

    # 3. Process Elements
    # We look for 'IfcElement' which covers Walls, Windows, Doors, etc.
    report_progress(40, "Processing elements...")
    elements = ifc_file.by_type("IfcElement")
    total = len(elements)

    for i, element in enumerate(elements):
        try:
            # Create the 3D shape from the IFC definition
            shape = ifcopenshell.geom.create_shape(settings, element)

            # Extract mesh data
            verts = shape.geometry.verts # [x, y, z, x, y, z...]
            faces = shape.geometry.faces # [v1, v2, v3, v1, v2, v3...]

            # Convert to USD format
            # Reshape the flat vertex list into (x, y, z) tuples
            points = [Gf.Vec3f(verts[i], verts[i+1], verts[i+2]) for i in range(0, len(verts), 3)]

            # IFC geometry via this method is usually triangles
            face_vertex_counts = [3] * (len(faces) // 3)

            # Create a unique path for each object (USD doesn't like dots or hashes)
            safe_name = f"{element.is_a()}_{element.id()}"
            prim_path = f"/World/{safe_name}"

            # Define the Mesh in USD
            usd_mesh = UsdGeom.Mesh.Define(stage, prim_path)
            usd_mesh.CreatePointsAttr(points)
            usd_mesh.CreateFaceVertexIndicesAttr(faces)
            usd_mesh.CreateFaceVertexCountsAttr(face_vertex_counts)

            # --- ATTACH DATA ---
            # This is where we keep the "BIM" in the USD
            prim = usd_mesh.GetPrim()
            prim.CreateAttribute("ifc:GlobalId", Sdf.ValueTypeNames.String).Set(element.GlobalId)
            prim.CreateAttribute("ifc:Type", Sdf.ValueTypeNames.String).Set(element.is_a())

            # Add Name if it exists
            if element.Name:
                prim.CreateAttribute("ifc:Name", Sdf.ValueTypeNames.String).Set(element.Name)

            # Progress: 40% to 90% during element processing
            progress = 40 + int((i / total) * 50)
            if i % 10 == 0 or i == total - 1:  # Report every 10 elements to avoid spam
                report_progress(progress, f"Processing elements ({i+1}/{total})...")

        except Exception as e:
            # Skip elements without geometry (like some voids or invisible objects)
            continue

    # 4. Save the result
    report_progress(95, "Saving USD file...")
    stage.GetRootLayer().Save()

    report_progress(100, "Conversion complete!")
    success_data = {
        "type": "success",
        "output": usd_path
    }
    print(json.dumps(success_data), flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Convert IFC to USD')
    parser.add_argument('input', help='Input IFC file path')
    parser.add_argument('output', help='Output USD file path')
    args = parser.parse_args()

    convert_ifc_to_usd(args.input, args.output)
