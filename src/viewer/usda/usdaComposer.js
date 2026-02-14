// src/viewer/usda/usdaComposer.js

/**
 * Recursively composes USDA text from a prim hierarchy
 * Handles properties, references, payloads, and nested children with proper indentation
 *
 * This function:
 * 1. Iterates through prims at current level
 * 2. Serializes each prim with properties (status, displayColor, displayName, custom properties)
 * 3. Formats references and payloads with proper USD syntax
 * 4. Recursively processes children with increased indentation
 * 5. Converts Xform to Scope for containers with referenced Meshes
 *
 * @param {Array<Object>} prims - Array of prim objects with path, type, properties, children
 * @param {number} indent - Current indentation level (0 = root)
 * @param {string} layerStatus - Fallback status for prims without explicit status
 * @returns {string} USDA text representation of the prim hierarchy
 * @example
 * const usdaText = composePrimsFromHierarchy(hierarchy, 0, 'Published');
 * // Returns:
 * // def Xform "World" {
 * //     custom token primvars:status = "Published"
 * //     def Mesh "Cube" {
 * //         custom token primvars:status = "WIP"
 * //     }
 * // }
 */
export function composePrimsFromHierarchy(prims, indent, layerStatus) {
  const primStrings = [];
  const indentStr = "    ".repeat(indent);

  if (!prims) return "";

  prims.forEach((prim) => {
    const specifier = prim.specifier || "def";
    let propertiesString = "";
    // Fix: Only use default if NOT a reference, or if explicitly requested
    // If it has a reference, it should inherit, unless status is explicitly locally set.
    // PHASE 4: ACTIVE STATE MANAGEMENT - ALWAYS WRITE STATUS
    let currentStatus = prim.properties.status;

    // Fallback if missing (shouldn't happen with active management, but for safety)
    if (!currentStatus) {
      currentStatus = prim._sourceLayerStatus || layerStatus || "Published";
    }

    // User Requirement: All prims MUST have a status token.
    if (!currentStatus) {
      currentStatus = "Published";
    }

    if (prim.properties) {
      if (prim.properties.displayColor) {
        const color = prim.properties.displayColor;
        propertiesString += `\n${indentStr}    color3f[] primvars:displayColor = [(${color.r}, ${color.g}, ${color.b})]`;
      }
      if (prim.properties.displayName) {
        propertiesString += `\n${indentStr}    custom string primvars:displayName = "${prim.properties.displayName}"`;
      }
    }

    if (currentStatus) {
      propertiesString += `\n${indentStr}    custom token primvars:status = "${currentStatus}"`;
    }

    if (prim.properties) {
      if (prim.properties.opacity !== undefined) {
        propertiesString += `\n${indentStr}    float opacity = ${prim.properties.opacity}`;
      }
      if (prim.properties.entityType) {
        propertiesString += `\n${indentStr}    custom string primvars:entityType = "${prim.properties.entityType}"`;
      }

      // Write all other custom properties
      const systemProperties = [
        "displayColor",
        "displayName",
        "status",
        "opacity",
        "entityType",
      ];

      for (const propName in prim.properties) {
        // Skip system properties already handled
        if (systemProperties.includes(propName)) continue;

        const propValue = prim.properties[propName];

        // Skip null/undefined values
        if (propValue === null || propValue === undefined) continue;

        // Determine property format based on name and value type
        let usdPropertyLine = "";

        // Handle different property value types
        if (typeof propValue === "object" && propValue.r !== undefined) {
          // Color values
          usdPropertyLine = `color3f[] ${propName} = [(${propValue.r}, ${propValue.g}, ${propValue.b})]`;
        } else if (typeof propValue === "number") {
          // Numeric values
          usdPropertyLine = `custom float ${propName} = ${propValue}`;
        } else if (typeof propValue === "boolean") {
          // Boolean values
          usdPropertyLine = `custom bool ${propName} = ${propValue}`;
        } else {
          // String values (default)
          // For Pset properties, the name already includes the namespace (PsetName:PropertyName)
          usdPropertyLine = `custom string ${propName} = "${propValue}"`;
        }

        propertiesString += `\n${indentStr}    ${usdPropertyLine}`;
      }
    }

    let metadataStr = "";
    if (prim.references) {
      const ref = prim.references;
      // Fix: correctly format references that usually come as "file.usda@<path>" or "file.usda"
      // We want to generate "@file.usda@<path>" or "@file.usda@"
      let assetPath = ref;
      let primPath = "";

      if (ref.includes("@<")) {
        const parts = ref.split("@<");
        assetPath = parts[0];
        primPath = `<${parts[1]}`;
      }

      // Clean existing @ from assetPath to avoid double wrapping
      assetPath = assetPath.replace(/^@+|@+$/g, "");

      const formattedRef = primPath
        ? `@${assetPath}@${primPath}`
        : `@${assetPath}@`;
      metadataStr = ` (\n${indentStr}    prepend references = ${formattedRef}\n${indentStr})`;
    } else if (prim.payload) {
      // Apply same logic for payloads
      const pl = prim.payload;
      let assetPath = pl;
      let primPath = "";
      if (pl.includes("@<")) {
        const parts = pl.split("@<");
        assetPath = parts[0];
        primPath = `<${parts[1]}`;
      }
      assetPath = assetPath.replace(/^@+|@+$/g, "");
      const formattedPl = primPath
        ? `@${assetPath}@${primPath}`
        : `@${assetPath}@`;

      metadataStr = ` (\n${indentStr}    prepend payload = ${formattedPl}\n${indentStr})`;
    }

    let type = prim.type;
    // Fix: Change Xform to Scope if it acts as a container for a Mesh with references
    if (
      type === "Xform" &&
      prim.children &&
      prim.children.some(
        (c) => c.type === "Mesh" && (c.references || c.payload)
      )
    ) {
      type = "Scope";
    }

    let primString = `${indentStr}${specifier} ${type} "${prim.name}"${metadataStr}\n${indentStr}{`;
    primString += propertiesString;

    if (prim.children && prim.children.length > 0) {
      primString +=
        "\n" +
        composePrimsFromHierarchy(prim.children, indent + 1, layerStatus);
    }
    primString += `\n${indentStr}}\n`;
    primStrings.push(primString);
  });
  return primStrings.join("");
}

export function composeHierarchyToUsda(hierarchy, layerStatus) {
  const defaultPrim = hierarchy.length > 0 ? hierarchy[0].name : "World";
  const definitions = composePrimsFromHierarchy(hierarchy, 0, layerStatus);
  return `#usda 1.0\n(\n    defaultPrim = "${defaultPrim}"\n    upAxis = "Z"\n)\n${definitions}\n`;
}

export function generateStageUsda(sceneName, composedHierarchy) {
  const validPrimName = sceneName.replace(/\s/g, "");
  const definitions = composePrimsFromHierarchy(composedHierarchy, 1, null);
  return `#usda 1.0\n(\n    defaultPrim = "${validPrimName}"\n    metersPerUnit = 1.0\n    upAxis = "Z"\n)\n\ndef Xform "${validPrimName}" (\n    kind = "assembly"\n)\n{\n${definitions}\n}\n`;
}

export function composeLogPrim(logEntry) {
  let extraFields = "";

  // Always include oldName and newName for consistency
  const oldName = logEntry["Old Name"] || logEntry.primName || "";
  const newName = logEntry["New Name"] || logEntry.primName || "";
  extraFields += `\n        custom string oldName = "${oldName}"\n        custom string newName = "${newName}"`;

  // ALWAYS include sourceStatus and targetStatus for ALL entries (user requirement)
  const sourceStatus = logEntry.sourceStatus || logEntry.SourceStatus || "null";
  const targetStatus = logEntry.targetStatus || logEntry.TargetStatus || "null";
  extraFields += `\n        custom string sourceStatus = "${sourceStatus}"\n        custom string targetStatus = "${targetStatus}"`;

  // Add parent field if exists
  if (logEntry.parent) {
    extraFields += `\n        custom string parent = "${logEntry.parent}"`;
  }

  let stagedPrimsField = "";
  if (logEntry.stagedPrims && logEntry.stagedPrims.length > 0) {
    const primPathsString = logEntry.stagedPrims
      .map((p) => `"${p}"`)
      .join(", ");
    stagedPrimsField = `\n        custom string[] stagedPrims = [${primPathsString}]`;
  }

  // NEW: Add entity type field
  let entityTypeField = "";
  if (logEntry.entityType) {
    entityTypeField = `\n        custom string entityType = "${logEntry.entityType}"`;
  }

  return `
    def "Log_${logEntry.ID}"
    {
        custom int entry = ${logEntry.Entry}
        custom string timestamp = "${logEntry.Timestamp}"
        custom string id = "${logEntry.ID}"
        custom string usdReferencePath = "${logEntry["USD Reference Path"]}"
        custom string fileName = "${logEntry["File Name"]}"
        custom string contentHash = "${logEntry["Content Hash"]}"
        custom int fileSize = ${logEntry["File Size"]}
        custom string type = "${logEntry.Type}"
        custom string user = "${logEntry.User}"
        custom string status = "${logEntry.Status}"${extraFields}${stagedPrimsField}${entityTypeField}


    }
`;
}
