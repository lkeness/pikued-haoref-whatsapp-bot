const https = require('https');
const logger = require('./logger');
const { historyCatToLiveCat } = require('./alertTypes');
const {
  OREF_ALERTS_URL,
  OREF_HISTORY_URL,
  OREF_REQUEST_HEADERS,
  OREF_HTTP_TIMEOUT_MS,
  HISTORY_POLL_INTERVAL_MS,
  POLL_MAX_BACKOFF_MS,
} = require('./constants');

class PikudHaorefSource {
  constructor({
    pollIntervalMs = 3000,
    onAlert,
    onAlertIdChange,
    onHistoryCheckpoint,
    onPoll,
    lastAlertId = null,
    lastHistoryTimestamp = null,
  }) {
    this.pollIntervalMs = pollIntervalMs;
    this.onAlert = onAlert;
    this.onAlertIdChange = onAlertIdChange;
    this.onHistoryCheckpoint = onHistoryCheckpoint || null;
    this.onPoll = onPoll || null;
    this._timer = null;
    this._historyTimer = null;
    this._lastAlertId = lastAlertId;
    this._lastHistoryTimestamp = lastHistoryTimestamp;
    this._firstSuccessfulPoll = false;
    this._consecutiveFailures = 0;
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
      this._consecutiveFailures = 0;

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
            const delivered = await this.onAlert(normalized);
            if (delivered) {
              this._lastAlertId = data.id;
              if (this.onAlertIdChange) this.onAlertIdChange(data.id);
            } else {
              logger.warn('Pikud HaOref: alert not confirmed delivered, will retry', {
                id: data.id,
              });
            }
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
      this._consecutiveFailures++;
      logger.error('Pikud HaOref: poll error', {
        error: err.message,
        consecutiveFailures: this._consecutiveFailures,
      });
    } finally {
      const backoff = Math.min(
        this.pollIntervalMs * Math.pow(2, this._consecutiveFailures),
        POLL_MAX_BACKOFF_MS,
      );
      const nextPoll = this._consecutiveFailures > 0 ? backoff : this.pollIntervalMs;
      if (this._consecutiveFailures > 0) {
        logger.warn(`Pikud HaOref: backing off, next poll in ${nextPoll}ms`, {
          consecutiveFailures: this._consecutiveFailures,
        });
      }
      this._timer = setTimeout(() => this._poll(), nextPoll);
    }
  }

  async _pollHistory() {
    try {
      const data = await this._fetchUrl(OREF_HISTORY_URL);
      if (!data || !Array.isArray(data) || data.length === 0) return;

      const checkpoint = this._lastHistoryTimestamp || 0;
      const newEntries = data.filter((entry) => {
        const ts = new Date(entry.alertDate).getTime();
        return ts > checkpoint && !isNaN(ts);
      });

      if (newEntries.length === 0) return;

      newEntries.sort((a, b) => new Date(a.alertDate) - new Date(b.alertDate));

      let latestProcessed = checkpoint;
      for (const entry of newEntries) {
        const normalized = {
          id: `history_${entry.alertDate}_${entry.data}`,
          cat: historyCatToLiveCat(entry.category),
          title: entry.title || '',
          cities: entry.data ? [entry.data] : [],
          instructions: entry.desc || '',
          source: 'pikud_haoref_history',
          raw: entry,
        };

        logger.info('Pikud HaOref (history): processing alert', {
          cat: normalized.cat,
          cities: normalized.cities,
          alertDate: entry.alertDate,
        });

        try {
          await this.onAlert(normalized);
          latestProcessed = new Date(entry.alertDate).getTime();
        } catch (err) {
          logger.warn('Pikud HaOref (history): handler failed, stopping batch', {
            error: err.message,
          });
          break;
        }
      }

      if (latestProcessed > checkpoint) {
        this._lastHistoryTimestamp = latestProcessed;
        if (this.onHistoryCheckpoint) this.onHistoryCheckpoint(latestProcessed);
      }
    } catch (err) {
      logger.warn('Pikud HaOref (history): poll error', { error: err.message });
    } finally {
      this._historyTimer = setTimeout(() => this._pollHistory(), HISTORY_POLL_INTERVAL_MS);
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
    return this._fetchUrl(OREF_ALERTS_URL);
  }

  _fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname,
        method: 'GET',
        headers: OREF_REQUEST_HEADERS,
        timeout: OREF_HTTP_TIMEOUT_MS,
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
            const clean = body
              .replace(/^\uFEFF/, '')
              .replace(/\x00/g, '') // eslint-disable-line no-control-regex
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
