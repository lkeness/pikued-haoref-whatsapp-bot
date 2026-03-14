const path = require('path');

const FALLBACK_WA_VERSION = [2, 3000, 1034074495];
const SESSION_DIR = path.resolve(__dirname, '../whatsapp-session-baileys');
const QUEUE_FILE = path.resolve(__dirname, '../.message-queue.json');
const DEDUP_STATE_FILE = path.resolve(__dirname, '../.dedup-state.json');
const LOGS_DIR = path.resolve(__dirname, '../logs');
const WA_BROWSER_ID = ['Alert Bot', 'Chrome', '1.0.0'];
const TIMEZONE = 'Asia/Jerusalem';
const LOCALE = 'he-IL';

module.exports = {
  FALLBACK_WA_VERSION,
  SESSION_DIR,
  QUEUE_FILE,
  DEDUP_STATE_FILE,
  LOGS_DIR,
  WA_BROWSER_ID,
  TIMEZONE,
  LOCALE,
};
