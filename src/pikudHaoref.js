const https = require('https');
const logger = require('./logger');

const ALERTS_URL = 'https://www.oref.org.il/WarningMessages/alert/alerts.json';
const HISTORY_URL = 'https://www.oref.org.il/WarningMessages/History/AlertsHistory.json';

const REQUEST_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'he',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: 'https://www.oref.org.il/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

class PikudHaorefSource {
  constructor({ pollIntervalMs = 3000, onAlert, onAlertIdChange, onPoll, lastAlertId = null }) {
    this.pollIntervalMs = pollIntervalMs;
    this.onAlert = onAlert;
    this.onAlertIdChange = onAlertIdChange;
    this.onPoll = onPoll || null;
    this._timer = null;
    this._historyTimer = null;
    this._lastAlertId = lastAlertId;
    this._lastHistoryId = null;
    this._firstSuccessfulPoll = false;
  }

  start() {
    logger.info('Pikud HaOref: polling started', { intervalMs: this.pollIntervalMs });
    this._poll();
    this._pollHistory();
  }

  stop() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._historyTimer) {
      clearTimeout(this._historyTimer);
      this._historyTimer = null;
    }
    logger.info('Pikud HaOref: stopped');
  }

  async _poll() {
    try {
      const data = await this._fetch();

      if (!this._firstSuccessfulPoll) {
        this._firstSuccessfulPoll = true;
        logger.info('Pikud HaOref: API reachable, polling active');
      }

      if (this.onPoll) this.onPoll();

      if (data && data.id && data.id !== this._lastAlertId) {
        const normalized = this._normalize(data);
        if (!normalized) {
          logger.warn('Pikud HaOref: invalid alert data, skipping', { id: data.id });
        } else {
          logger.info(
            `Pikud HaOref: alert [${data.cat}] ${data.title} (${(data.data || []).length} cities)`,
          );

          try {
            await this.onAlert(normalized);
            this._lastAlertId = data.id;
            if (this.onAlertIdChange) this.onAlertIdChange(data.id);
          } catch (err) {
            logger.error('Pikud HaOref: alert handler failed, will retry next poll', {
              error: err.message,
            });
          }
        }
      } else {
        logger.debug('Pikud HaOref: no active alerts');
      }
    } catch (err) {
      logger.error('Pikud HaOref: poll error', { error: err.message });
    } finally {
      this._timer = setTimeout(() => this._poll(), this.pollIntervalMs);
    }
  }

  async _pollHistory() {
    try {
      const data = await this._fetchUrl(HISTORY_URL);
      if (!data || !Array.isArray(data) || data.length === 0) return;

      const latest = data[0];
      const historyId = `history_${latest.alertDate}_${latest.data}`;
      if (historyId === this._lastHistoryId) return;

      const alertTime = new Date(latest.alertDate).getTime();
      const isRecent = Date.now() - alertTime < 30000;

      if (isRecent) {
        const normalized = {
          id: historyId,
          cat: String(latest.category),
          title: latest.title || '',
          cities: latest.data ? [latest.data] : [],
          instructions: latest.desc || '',
          source: 'pikud_haoref_history',
          raw: latest,
        };

        logger.info('Pikud HaOref (history): new alert', {
          cat: normalized.cat,
          cities: normalized.cities,
        });

        try {
          await this.onAlert(normalized);
        } catch (err) {
          logger.error('Pikud HaOref (history): handler failed', { error: err.message });
          return;
        }
      }

      this._lastHistoryId = historyId;
    } catch (err) {
      logger.debug('Pikud HaOref (history): poll error', { error: err.message });
    } finally {
      this._historyTimer = setTimeout(() => this._pollHistory(), 10000);
    }
  }

  _normalize(data) {
    if (!data || !data.id || !data.cat) return null;
    return {
      id: data.id,
      cat: String(data.cat),
      title: data.title || '',
      cities: Array.isArray(data.data) ? data.data : [],
      instructions: data.desc || '',
      source: 'pikud_haoref',
      raw: data,
    };
  }

  _fetch() {
    return this._fetchUrl(ALERTS_URL);
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
          if (res.statusCode !== 200) {
            logger.warn('Pikud HaOref: non-200 response', { statusCode: res.statusCode });
            resolve(null);
            return;
          }

          try {
            // eslint-disable-next-line no-control-regex
            const clean = body
              .replace(/^\uFEFF/, '')
              .replace(/\x00/g, '')
              .trim();
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
