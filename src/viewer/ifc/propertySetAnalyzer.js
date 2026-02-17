/**
 * PropertySetAnalyzer - Analyzes IFC entity properties to identify repeated patterns
 * Used to determine which property sets should become USD class definitions
 */
export class PropertySetAnalyzer {
  constructor() {
    this.propertySetSignatures = new Map(); // signature -> { entities: [], count: number }
    this.entityToSignature = new Map(); // entityID -> signature
  }

  /**
   * Analyze entities and group by property patterns
   * @param {Array} entities - Array of {entityID, typeName, properties}
   */
  analyzeEntities(entities) {
    for (const entity of entities) {
      const signature = this.createSignature(
        entity.typeName,
        entity.properties
      );

      if (!this.propertySetSignatures.has(signature)) {
        this.propertySetSignatures.set(signature, {
          entities: [],
          count: 0,
          typeName: entity.typeName,
          properties: entity.properties,
        });
      }

      const signatureData = this.propertySetSignatures.get(signature);
      signatureData.entities.push(entity.entityID);
      signatureData.count++;

      this.entityToSignature.set(entity.entityID, signature);
    }

    console.log(
      `[PropertySetAnalyzer] Analyzed ${entities.length} entities, found ${this.propertySetSignatures.size} unique property patterns`
    );
  }

  /**
   * Create signature from IFC type and properties
   * @param {string} typeName - IFC type name (e.g., "IFCWALL")
   * @param {Object} properties - Property key-value pairs
   * @returns {string} Signature string
   */
  createSignature(typeName, properties) {
    // Sort property keys for consistent signature
    const sortedKeys = Object.keys(properties || {}).sort();

    // Create signature: "IFCTYPE|prop1,prop2,prop3"
    // We only care about which properties exist, not their values
    // Values will be compared later to separate common vs unique
    return `${typeName}|${sortedKeys.join(",")}`;
  }

  /**
   * Identify property patterns that appear frequently enough to warrant USD classes
   * @param {number} minInstances - Minimum number of instances to create a class (default: 3)
   * @returns {Map} Map of signature -> entity data for class candidates
   */
  identifyClassCandidates(minInstances = 3) {
    const candidates = new Map();

    for (const [signature, data] of this.propertySetSignatures) {
      if (data.count >= minInstances) {
        candidates.set(signature, data);
        console.log(
          `[PropertySetAnalyzer] Class candidate: ${signature} (${data.count} instances)`
        );
      }
    }

    console.log(
      `[PropertySetAnalyzer] Found ${candidates.size} class candidates (min ${minInstances} instances)`
    );
    return candidates;
  }

  /**
   * Separate common properties from unique properties for a group of entities
   * @param {Object} signatureData - Data from propertySetSignatures
   * @param {string} signature - The signature key
   * @returns {Object} { common: {...}, uniquePerEntity: Map<entityID, {...}> }
   */
  separateCommonProperties(signatureData, signature) {
    const entities = signatureData.entities;

    // For entities with the same signature, we need to find:
    // - Common properties (same value across all instances)
    // - Unique properties (different values per instance)

    const common = {};
    const uniquePerEntity = new Map();

    if (entities.length === 0) {
      return { common, uniquePerEntity };
    }

    // Get all property keys from the signature
    const [, propsStr] = signature.split("|");
    const propertyKeys = propsStr ? propsStr.split(",") : [];

    // For each property key, check if all entities have the same value
    for (const key of propertyKeys) {
      // Collect all values for this property across all entities
      for (const entityID of entities) {
        // We need to get the actual property value
        // This will be done by the caller who has access to the full entity data
        // For now, we'll mark properties that exist in the signature as common
        // The actual value comparison will be done in ifcToUsdConverter.js
      }

      // For now, mark all properties as potential common properties
      // The actual filtering will be done when creating classes
      common[key] = null; // Placeholder - actual value determined by converter
    }

    return { common, uniquePerEntity };
  }

  /**
   * Get signature for a specific entity
   * @param {number} entityID - Entity ID
   * @returns {string|null} Signature or null if not found
   */
  getSignature(entityID) {
    return this.entityToSignature.get(entityID) || null;
  }

  /**
   * Get all entities that share a signature
   * @param {string} signature - Signature to look up
   * @returns {Array} Array of entity IDs
   */
  getEntitiesBySignature(signature) {
    const data = this.propertySetSignatures.get(signature);
    return data ? data.entities : [];
  }
}
