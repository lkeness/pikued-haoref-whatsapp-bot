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

  _contentKey(cat, cities) {
    const sorted = (cities || []).slice().sort().join('|');
    return `${cat}::${sorted}`;
  }

  isDuplicate(alert) {
    this._cleanup();

    if (alert.id && this.seen.has(`id::${alert.id}`)) {
      logger.debug('Dedup: alert already seen by id', { id: alert.id });
      return true;
    }

    const key = this._contentKey(alert.cat, alert.cities);
    if (this.seen.has(key)) {
      logger.debug('Dedup: alert already seen by content key', { key });
      return true;
    }

    if (alert.cities && alert.cities.length > 0) {
      const allSeen = alert.cities.every((city) =>
        this.seen.has(this._contentKey(alert.cat, [city])),
      );
      if (allSeen) {
        logger.debug('Dedup: all cities already seen individually', {
          cat: alert.cat,
          cities: alert.cities,
        });
        return true;
      }
    }

    return false;
  }

  markSeen(alert) {
    const now = Date.now();
    if (alert.id) {
      this.seen.set(`id::${alert.id}`, now);
    }
    const cities = alert.cities || [];
    if (cities.length > 0) {
      this.seen.set(this._contentKey(alert.cat, cities), now);
    }
    for (const city of cities) {
      this.seen.set(this._contentKey(alert.cat, [city]), now);
    }
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
