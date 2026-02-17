/**
 * GeometryHasher - Creates content-based hashes for geometry de-duplication
 * Uses FNV-1a hash algorithm for speed and collision resistance
 */
export class GeometryHasher {
  /**
   * Hash geometry using FNV-1a algorithm
   * @param {Array} points - Array of [x, y, z] vertex positions
   * @param {Array} faces - Array of [i1, i2, i3] face indices
   * @returns {string} 64-character hex hash string
   */
  static hashGeometry(points, faces) {
    // FNV-1a constants
    const FNV_OFFSET_BASIS = 2166136261n;
    const FNV_PRIME = 16777619n;

    let hash = FNV_OFFSET_BASIS;

    // Hash point count
    hash = this.hashNumber(hash, points.length, FNV_PRIME);

    // Hash face count
    hash = this.hashNumber(hash, faces.length, FNV_PRIME);

    // Hash vertex positions (sample every 10th point for performance)
    const step = Math.max(1, Math.floor(points.length / 100));
    for (let i = 0; i < points.length; i += step) {
      const point = points[i];
      hash = this.hashNumber(hash, point[0], FNV_PRIME);
      hash = this.hashNumber(hash, point[1], FNV_PRIME);
      hash = this.hashNumber(hash, point[2], FNV_PRIME);
    }

    // Hash face topology (sample every 10th face)
    const faceStep = Math.max(1, Math.floor(faces.length / 100));
    for (let i = 0; i < faces.length; i += faceStep) {
      const face = faces[i];
      hash = this.hashNumber(hash, face[0], FNV_PRIME);
      hash = this.hashNumber(hash, face[1], FNV_PRIME);
      hash = this.hashNumber(hash, face[2], FNV_PRIME);
    }

    // Convert to hex string
    return hash.toString(16).padStart(16, "0");
  }

  /**
   * Hash a single number into the running hash
   * @param {BigInt} hash - Current hash value
   * @param {number} num - Number to hash
   * @param {BigInt} prime - FNV prime
   * @returns {BigInt} Updated hash
   */
  static hashNumber(hash, num, prime) {
    // Round to 4 decimal places to handle floating point precision
    const rounded = Math.round(num * 10000) / 10000;
    const bytes = this.numberToBytes(rounded);

    for (const byte of bytes) {
      hash = (hash ^ BigInt(byte)) * prime;
      // Keep hash in 32-bit range
      hash = hash & 0xffffffffn;
    }

    return hash;
  }

  /**
   * Convert number to bytes
   * @param {number} num - Number to convert
   * @returns {Uint8Array} Byte array
   */
  static numberToBytes(num) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, num, true); // little endian
    return new Uint8Array(buffer);
  }

  /**
   * Exact comparison of two geometries (fallback for hash collision detection)
   * @param {Object} geom1 - First geometry {points, faces}
   * @param {Object} geom2 - Second geometry {points, faces}
   * @param {number} tolerance - Comparison tolerance (default 0.0001)
   * @returns {boolean} True if geometries match exactly
   */
  static geometriesMatch(geom1, geom2, tolerance = 0.0001) {
    // Check counts
    if (geom1.points.length !== geom2.points.length) return false;
    if (geom1.faces.length !== geom2.faces.length) return false;

    // Check vertex positions
    for (let i = 0; i < geom1.points.length; i++) {
      const p1 = geom1.points[i];
      const p2 = geom2.points[i];

      if (Math.abs(p1[0] - p2[0]) > tolerance) return false;
      if (Math.abs(p1[1] - p2[1]) > tolerance) return false;
      if (Math.abs(p1[2] - p2[2]) > tolerance) return false;
    }

    // Check face indices
    for (let i = 0; i < geom1.faces.length; i++) {
      const f1 = geom1.faces[i];
      const f2 = geom2.faces[i];

      if (f1[0] !== f2[0] || f1[1] !== f2[1] || f1[2] !== f2[2]) return false;
    }

    return true;
  }
}
