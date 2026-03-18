const path = require('path');

// File paths
const SESSION_DIR = path.resolve(__dirname, '../whatsapp-session-baileys');
const QUEUE_FILE = path.resolve(__dirname, '../.message-queue.json');
const DEDUP_STATE_FILE = path.resolve(__dirname, '../.dedup-state.json');
const LOGS_DIR = path.resolve(__dirname, '../logs');
const ALERT_METADATA_CACHE_FILE = path.resolve(__dirname, '../.alert-metadata-cache.json');
const PIKUD_LOGO_PATH = path.resolve(__dirname, 'assets/pikud-logo.png');

// WhatsApp identity
const FALLBACK_WA_VERSION = [2, 3000, 1034074495];
const WA_BROWSER_ID = ['Alert Bot', 'Chrome', '1.0.0'];

// Oref API
const OREF_ALERTS_URL = 'https://www.oref.org.il/WarningMessages/alert/alerts.json';
const OREF_HISTORY_URL = 'https://www.oref.org.il/warningMessages/alert/History/AlertsHistory.json';
const OREF_TRANSLATIONS_URL = 'https://www.oref.org.il/alerts/alertsTranslation.json';
const OREF_REQUEST_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'he',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: 'https://www.oref.org.il/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};
const OREF_HTTP_TIMEOUT_MS = 5_000;
const METADATA_HTTP_TIMEOUT_MS = 10_000;

// Alert categories (Oref API numeric IDs)
const HFC_UPDATE_CAT = 10;
const HFC_RELEASE_CAT_ID = 13;

// Display / locale
const TIMEZONE = 'Asia/Jerusalem';
const LOCALE = 'he-IL';
const MAX_CITIES_DISPLAY = 15;

// Deduplication
const DEFAULT_DEDUP_WINDOW_MS = 180_000;

// Oref polling
const HISTORY_POLL_INTERVAL_MS = 10_000;
const POLL_MAX_BACKOFF_MS = 60_000;
const METADATA_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

// WhatsApp connection
const CONNECTION_TIMEOUT_MS = 60_000;
const CONNECTION_POLL_MS = 500;
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const HEALTH_CHECK_TIMEOUT_MS = 10_000;
const SEND_TIMEOUT_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const QUEUE_RETRY_INTERVAL_MS = 30_000;
const QUEUE_FLUSH_DELAY_MS = 1_000;

// Maintenance
const MAINTENANCE_MIN_SEND_INTERVAL_MS = 2_000;

// Logging
const ERROR_LOG_MAX_SIZE = 5 * 1024 * 1024;
const ERROR_LOG_MAX_FILES = 3;
const COMBINED_LOG_MAX_SIZE = 10 * 1024 * 1024;
const COMBINED_LOG_MAX_FILES = 5;

// Process
const CRASH_EXIT_DELAY_MS = 3_000;
const SETUP_DELAY_MS = 3_000;

// libsignal internal logging noise (Signal protocol session negotiation)
// All originate from node_modules/libsignal/src/ — Baileys handles these gracefully.
// Real connection issues come through Baileys' connection.update event.
const LIBSIGNAL_NOISE_PATTERNS = [
  'Bad MAC',
  'Failed to decrypt',
  'Decrypted message with closed session',
  'No matching sessions',
  'Closing open session',
  'Closing session:',
  'Session error',
  'decryptGroupSignalProto',
  'pre-key',
  'prekey',
  'senderKeyMessage',
];

module.exports = {
  SESSION_DIR,
  QUEUE_FILE,
  DEDUP_STATE_FILE,
  LOGS_DIR,
  ALERT_METADATA_CACHE_FILE,
  PIKUD_LOGO_PATH,
  FALLBACK_WA_VERSION,
  WA_BROWSER_ID,
  OREF_ALERTS_URL,
  OREF_HISTORY_URL,
  OREF_TRANSLATIONS_URL,
  OREF_REQUEST_HEADERS,
  OREF_HTTP_TIMEOUT_MS,
  METADATA_HTTP_TIMEOUT_MS,
  HFC_UPDATE_CAT,
  HFC_RELEASE_CAT_ID,
  TIMEZONE,
  LOCALE,
  MAX_CITIES_DISPLAY,
  DEFAULT_DEDUP_WINDOW_MS,
  HISTORY_POLL_INTERVAL_MS,
  POLL_MAX_BACKOFF_MS,
  METADATA_REFRESH_INTERVAL_MS,
  CONNECTION_TIMEOUT_MS,
  CONNECTION_POLL_MS,
  HEALTH_CHECK_INTERVAL_MS,
  HEALTH_CHECK_TIMEOUT_MS,
  SEND_TIMEOUT_MS,
  INITIAL_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
  QUEUE_RETRY_INTERVAL_MS,
  QUEUE_FLUSH_DELAY_MS,
  MAINTENANCE_MIN_SEND_INTERVAL_MS,
  ERROR_LOG_MAX_SIZE,
  ERROR_LOG_MAX_FILES,
  COMBINED_LOG_MAX_SIZE,
  COMBINED_LOG_MAX_FILES,
  CRASH_EXIT_DELAY_MS,
  SETUP_DELAY_MS,
  LIBSIGNAL_NOISE_PATTERNS,
};
