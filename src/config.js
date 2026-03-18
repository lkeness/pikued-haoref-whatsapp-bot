require('dotenv').config();
const { DEFAULT_DEDUP_WINDOW_MS } = require('./constants');

const required = ['WHATSAPP_GROUP_ID'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}. Run \`npm run setup\` to configure.`);
    process.exit(1);
  }
}

const config = {
  whatsappGroupId: process.env.WHATSAPP_GROUP_ID,
  maintenanceGroupId: process.env.MAINTENANCE_GROUP_ID || null,
  logLevel: process.env.LOG_LEVEL || 'info',
  pikudHaoref: {
    pollIntervalMs: parseInt(process.env.PIKUD_HAOREF_POLL_INTERVAL_MS, 10) || 3000,
  },
  filterCities: process.env.FILTER_CITIES
    ? process.env.FILTER_CITIES.split(',')
        .map((c) => c.trim())
        .filter(Boolean)
    : [],
  adjacentCities: process.env.ADJACENT_CITIES
    ? process.env.ADJACENT_CITIES.split(',')
        .map((c) => c.trim())
        .filter(Boolean)
    : [],
  sendEventEnded: (process.env.SEND_EVENT_ENDED || '').toLowerCase() !== 'false',
  dedupWindowMs: parseInt(process.env.DEDUP_WINDOW_MS, 10) || DEFAULT_DEDUP_WINDOW_MS,
  maintenanceStatusIntervalMs:
    parseInt(process.env.MAINTENANCE_STATUS_INTERVAL_MS, 10) || 30 * 60 * 1000,
  maxQueueAgeMs: parseInt(process.env.MAX_QUEUE_AGE_MS, 10) || 180000,
};

module.exports = config;
