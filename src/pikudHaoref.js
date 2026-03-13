// ===========================================
// Pikud HaOref (Home Front Command) alert source
// Polls https://www.oref.org.il/WarningMessages/alert/alerts.json
// NOTE: Only accessible from Israeli IP addresses!
// ===========================================

const https = require('https');
const http = require('http');
const logger = require('./logger');

const ALERTS_URL = 'https://www.oref.org.il/WarningMessages/alert/alerts.json';
const HISTORY_URL = 'https://www.oref.org.il/WarningMessages/History/AlertsHistory.json';

// Pikud HaOref requires specific headers to respond
const REQUEST_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'he',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://www.oref.org.il/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

class PikudHaorefSource {
  /**
   * @param {Object} opts
   * @param {number} opts.pollIntervalMs - Polling interval in ms (default 3000)
   * @param {function} opts.onAlert - Callback when a new alert arrives
   * @param {string} [opts.proxy] - Optional HTTP proxy URL for non-Israeli IPs
   */
  constructor({ pollIntervalMs = 3000, onAlert, proxy = null }) {
    this.pollIntervalMs = pollIntervalMs;
    this.onAlert = onAlert;
    this.proxy = proxy;
    this._timer = null;
    this._lastAlertId = null;
    this._firstSuccessfulPoll = false;
  }

  start() {
    logger.info('Pikud HaOref: polling started', { intervalMs: this.pollIntervalMs });
    this._poll();
  }

  stop() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    logger.info('Pikud HaOref: stopped');
  }

  async _poll() {
    try {
      const data = await this._fetch();

      // One-time confirmation that the API is reachable
      if (!this._firstSuccessfulPoll) {
        this._firstSuccessfulPoll = true;
        logger.info('Pikud HaOref: API reachable, polling active');
      }

      if (data && data.id && data.id !== this._lastAlertId) {
        this._lastAlertId = data.id;

        logger.info(`Pikud HaOref: alert [${data.cat}] ${data.title} (${(data.data || []).length} cities)`);

        const normalized = {
          id: data.id,
          cat: data.cat,
          title: data.title || '',
          cities: data.data || [],
          instructions: data.desc || '',
          source: 'pikud_haoref',
          raw: data,
        };

        this.onAlert(normalized);
      } else {
        logger.debug('Pikud HaOref: poll OK, no active alerts');
      }
    } catch (err) {
      logger.error('Pikud HaOref: poll error', { error: err.message });
    }

    // Schedule next poll
    this._timer = setTimeout(() => this._poll(), this.pollIntervalMs);
  }

  _fetch() {
    return this._fetchUrl(ALERTS_URL);
  }

  async _pollHistory() {
    try {
      const data = await this._fetchUrl(HISTORY_URL);
      if (data && Array.isArray(data) && data.length > 0) {
        // History returns an array of past alerts. Check the most recent one.
        const latest = data[0];
        const historyId = `history_${latest.alertDate}_${latest.data}`;
        if (historyId !== this._lastHistoryId) {
          this._lastHistoryId = historyId;

          // Only emit if the alert is recent (within last 30 seconds)
          const alertTime = new Date(latest.alertDate).getTime();
          const now = Date.now();
          if (now - alertTime < 30000) {
            const normalized = {
              id: historyId,
              cat: String(latest.category),
              title: latest.title || '',
              cities: latest.data ? [latest.data] : [],
              instructions: latest.desc || '',
              source: 'pikud_haoref',
              raw: latest,
            };
            logger.info('Pikud HaOref (history): new alert', {
              cat: normalized.cat,
              cities: normalized.cities,
            });
            this.onAlert(normalized);
          }
        }
      }
    } catch (err) {
      logger.debug('Pikud HaOref (history): poll error', { error: err.message });
    }
    this._historyTimer = setTimeout(() => this._pollHistory(), 10000);
  }

  _fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname,
        method: 'GET',
        headers: REQUEST_HEADERS,
        timeout: 5000,
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          // If not 200, treat as error
          if (res.statusCode !== 200) {
            logger.warn('Pikud HaOref: non-200 response', { statusCode: res.statusCode });
            resolve(null);
            return;
          }

          try {
            // Strip BOM and NUL bytes (API sometimes sends garbage)
            // eslint-disable-next-line no-control-regex
            const clean = body.replace(/^\uFEFF/, '').replace(/\x00/g, '').trim();
            if (!clean || clean === '[]') {
              resolve(null);
              return;
            }
            const parsed = JSON.parse(clean);
            if (Array.isArray(parsed) && parsed.length === 0) {
              resolve(null);
            } else {
              resolve(parsed);
            }
          } catch (e) {
            logger.warn('Pikud HaOref: parse error', {
              error: e.message,
              body: body.substring(0, 200),
            });
            resolve(null);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });
      req.end();
    });
  }
}

module.exports = PikudHaorefSource;