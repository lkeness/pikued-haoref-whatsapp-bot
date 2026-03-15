const fs = require('fs');
const logger = require('./logger');
const { DEDUP_STATE_FILE } = require('./constants');
const { atomicWriteSync } = require('./utils');

class AlertDeduplicator {
  constructor(windowMs = 60000) {
    this.windowMs = windowMs;
    /** @type {Map<string, number>} */
    this.seen = new Map();
    this.lastAlertId = null;
    this.lastHistoryTimestamp = null;
    this._load();
  }

  makeKey(alert) {
    const cities = (alert.cities || []).slice().sort().join('|');
    return `${alert.cat}::${cities}`;
  }

  isDuplicate(alert) {
    this._cleanup();
    return this.seen.has(this.makeKey(alert));
  }

  markSeen(alert) {
    const key = this.makeKey(alert);
    this.seen.set(key, Date.now());
    this._save();
  }

  setLastAlertId(id) {
    this.lastAlertId = id;
    this._save();
  }

  setLastHistoryTimestamp(ts) {
    this.lastHistoryTimestamp = ts;
    this._save();
  }

  clear() {
    this.seen.clear();
    this._save();
    logger.info('Dedup: state cleared');
  }

  _cleanup() {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, ts] of this.seen) {
      if (ts < cutoff) this.seen.delete(key);
    }
  }

  _save() {
    try {
      const data = JSON.stringify({
        lastAlertId: this.lastAlertId,
        lastHistoryTimestamp: this.lastHistoryTimestamp,
        seen: Object.fromEntries(this.seen),
      });
      atomicWriteSync(DEDUP_STATE_FILE, data);
    } catch (err) {
      logger.error('Dedup: failed to save state', { error: err.message });
    }
  }

  _load() {
    try {
      if (!fs.existsSync(DEDUP_STATE_FILE)) return;
      const raw = JSON.parse(fs.readFileSync(DEDUP_STATE_FILE, 'utf8'));
      this.lastAlertId = raw.lastAlertId || null;
      this.lastHistoryTimestamp = raw.lastHistoryTimestamp || null;
      const cutoff = Date.now() - this.windowMs;
      for (const [key, ts] of Object.entries(raw.seen || {})) {
        if (ts >= cutoff) this.seen.set(key, ts);
      }
      logger.info('Dedup: restored state', {
        lastAlertId: this.lastAlertId,
        lastHistoryTimestamp: this.lastHistoryTimestamp,
        seenCount: this.seen.size,
      });
    } catch (err) {
      logger.warn('Dedup: could not load state, starting fresh', { error: err.message });
    }
  }
}

module.exports = AlertDeduplicator;
