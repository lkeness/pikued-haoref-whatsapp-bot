const https = require('https');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const TRANSLATIONS_URL = 'https://www.oref.org.il/alerts/alertsTranslation.json';
const CACHE_FILE = path.resolve(__dirname, '../.alert-metadata-cache.json');
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

const REQUEST_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'he',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: 'https://www.oref.org.il/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

const HFC_RELEASE_CAT_ID = 13;

class AlertMetadata {
  constructor() {
    this._releaseTitles = new Set();
    this._historyToLiveMap = new Map();
    this._refreshTimer = null;
  }

  async load() {
    let data = await this._fetchFromApi();
    if (data) {
      this._saveCache(data);
    } else {
      logger.warn('AlertMetadata: API fetch failed, trying cache');
      data = this._loadCache();
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      logger.error('AlertMetadata: no translation data available');
      return;
    }

    this._process(data);
    this._scheduleRefresh();
    logger.info('AlertMetadata: loaded from Oref API', {
      releaseTitles: this._releaseTitles.size,
      historyMappings: this._historyToLiveMap.size,
    });
  }

  _process(entries) {
    this._releaseTitles.clear();
    this._historyToLiveMap.clear();

    const releaseCandidates = new Set();
    const activeTitles = new Set();

    for (const entry of entries) {
      const { catId, matrixCatId, hebTitle } = entry;

      if (matrixCatId === 10 && hebTitle) {
        if (catId === HFC_RELEASE_CAT_ID) {
          releaseCandidates.add(hebTitle);
        } else {
          activeTitles.add(hebTitle);
        }
      }

      if (catId > 0 && matrixCatId > 0) {
        this._historyToLiveMap.set(catId, String(matrixCatId));
      }
    }

    for (const title of releaseCandidates) {
      if (!activeTitles.has(title)) {
        this._releaseTitles.add(title);
      }
    }
  }

  isRelease(alert) {
    if (this._releaseTitles.size === 0) return false;
    return this._releaseTitles.has(alert.title);
  }

  historyCatToLiveCat(historyCat) {
    const catId = parseInt(historyCat);
    if (this._historyToLiveMap.size > 0) {
      const mapped = this._historyToLiveMap.get(catId);
      if (mapped) return mapped;
    }
    return String(historyCat);
  }

  _scheduleRefresh() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = setInterval(async () => {
      try {
        const data = await this._fetchFromApi();
        if (data && Array.isArray(data) && data.length > 0) {
          this._process(data);
          this._saveCache(data);
          logger.info('AlertMetadata: refreshed', {
            releaseTitles: this._releaseTitles.size,
          });
        }
      } catch (err) {
        logger.warn('AlertMetadata: refresh failed', { error: err.message });
      }
    }, REFRESH_INTERVAL_MS);
  }

  stop() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  _fetchFromApi() {
    return new Promise((resolve) => {
      const parsedUrl = new URL(TRANSLATIONS_URL);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname,
        method: 'GET',
        headers: REQUEST_HEADERS,
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            logger.warn('AlertMetadata: non-200 response', { statusCode: res.statusCode });
            resolve(null);
            return;
          }
          try {
            const parsed = JSON.parse(body.replace(/^\uFEFF/, '').trim());
            if (Array.isArray(parsed) && parsed.length > 0) {
              resolve(parsed);
            } else {
              resolve(null);
            }
          } catch (e) {
            logger.warn('AlertMetadata: parse error', { error: e.message });
            resolve(null);
          }
        });
      });

      req.on('error', (err) => {
        logger.warn('AlertMetadata: fetch error', { error: err.message });
        resolve(null);
      });
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    });
  }

  _loadCache() {
    try {
      if (!fs.existsSync(CACHE_FILE)) return null;
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {
      return null;
    }
  }

  _saveCache(data) {
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
    } catch (err) {
      logger.warn('AlertMetadata: cache save failed', { error: err.message });
    }
  }
}

module.exports = new AlertMetadata();
