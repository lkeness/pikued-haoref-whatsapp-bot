require('dotenv').config();

const config = {
  whatsappGroupId: process.env.WHATSAPP_GROUP_ID,
  maintenanceGroupId: process.env.MAINTENANCE_GROUP_ID || null,
  pikudHaoref: {
    pollIntervalMs: parseInt(process.env.PIKUD_HAOREF_POLL_INTERVAL_MS) || 3000,
  },
  filterCities: process.env.FILTER_CITIES
    ? process.env.FILTER_CITIES.split(',')
        .map((c) => c.trim())
        .filter(Boolean)
    : [],
  sendEventEnded: process.env.SEND_EVENT_ENDED !== 'false',
  dedupWindowMs: parseInt(process.env.DEDUP_WINDOW_MS) || 60000,
  maintenanceStatusIntervalMs:
    parseInt(process.env.MAINTENANCE_STATUS_INTERVAL_MS) || 30 * 60 * 1000,
};

module.exports = config;
