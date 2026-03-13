// ===========================================
// Alert deduplication
// Prevents the same alert from being sent twice.
// ===========================================

const logger = require('./logger');

class AlertDeduplicator {
  constructor(windowMs = 60000) {
    this.windowMs = windowMs;
    /** @type {Map<string, number>} alertKey -> timestamp */
    this.seen = new Map();
  }

  /**
   * Generate a dedup key from an alert.
   * We combine the alert type + sorted city names.
   */
  makeKey(alert) {
    const cities = (alert.cities || []).slice().sort().join('|');
    return `${alert.type}::${cities}`;
  }

  /**
   * Check if this alert has already been seen.
   * Does NOT mark it as seen — call markSeen() after successful send.
   * @param {Object} alert - Normalized alert object
   * @returns {boolean} true if duplicate (should be skipped)
   */
  isDuplicate(alert) {
    this._cleanup();
    const key = this.makeKey(alert);
    if (this.seen.has(key)) {
      logger.debug(`Duplicate alert skipped: ${key}`);
      return true;
    }
    return false;
  }

  /**
   * Mark an alert as seen. Call after confirmed send.
   * @param {Object} alert - Normalized alert object
   */
  markSeen(alert) {
    const key = this.makeKey(alert);
    this.seen.set(key, Date.now());
  }

  /** Remove expired entries */
  _cleanup() {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, ts] of this.seen) {
      if (ts < cutoff) this.seen.delete(key);
    }
  }
}

module.exports = AlertDeduplicator;
