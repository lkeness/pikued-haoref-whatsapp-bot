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

    if (alert.source === 'pikud_haoref') {
      const isDup = alert.id ? this.seen.has(`id::${alert.id}`) : false;
      if (isDup) {
        logger.debug('Dedup: live alert already seen', { id: alert.id });
      }
      return isDup;
    }

    const key = this._contentKey(alert.cat, alert.cities);
    const isDup = this.seen.has(key);
    if (isDup) {
      logger.debug('Dedup: history content already seen', { key });
    }
    return isDup;
  }

  markSeen(alert) {
    const now = Date.now();
    if (alert.id) {
      this.seen.set(`id::${alert.id}`, now);
    }
    for (const city of alert.cities || []) {
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
