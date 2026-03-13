// ===========================================
// Red Alert WhatsApp Bot — Main Entry Point
//
// Receives alerts from Pikud HaOref,
// deduplicates, formats, and forwards to a
// WhatsApp group.
// ===========================================

require('dotenv').config();
const fs = require('fs');
const logger = require('./logger');
const { formatAlertMessage } = require('./alertTypes');
const { generateAlertImage } = require('./alertImage');
const AlertDeduplicator = require('./dedup');
const PikudHaorefSource = require('./pikudHaoref');
const WhatsAppClient = require('./whatsapp');

// Ensure logs directory exists
if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');

// ------------------------------------------
// Config
// ------------------------------------------
const config = {
  whatsappGroupId: process.env.WHATSAPP_GROUP_ID,
  pikudHaoref: {
    pollIntervalMs: parseInt(process.env.PIKUD_HAOREF_POLL_INTERVAL_MS) || 3000,
  },
  filterCities: process.env.FILTER_CITIES
    ? process.env.FILTER_CITIES.split(',').map((c) => c.trim()).filter(Boolean)
    : [],
  sendEventEnded: process.env.SEND_EVENT_ENDED !== 'false',
  dedupWindowMs: parseInt(process.env.DEDUP_WINDOW_MS) || 60000,
};

// ------------------------------------------
// Validate
// ------------------------------------------
if (!config.whatsappGroupId) {
  logger.error('WHATSAPP_GROUP_ID is not set. Run `npm run setup` to find your group ID, then add it to .env');
  process.exit(1);
}

logger.info('Starting Red Alert WhatsApp Bot', {
  pollIntervalMs: config.pikudHaoref.pollIntervalMs,
  filterCities: config.filterCities.length > 0 ? config.filterCities : 'ALL',
  groupId: config.whatsappGroupId,
});

// ------------------------------------------
// Initialize components
// ------------------------------------------
const dedup = new AlertDeduplicator(config.dedupWindowMs);

const whatsapp = new WhatsAppClient({
  groupId: config.whatsappGroupId,
});

// ------------------------------------------
// Central alert handler
// ------------------------------------------
async function handleAlert(alert) {
  // Suppress "event ended" if configured
  if (alert.type === 'eventEnded' && !config.sendEventEnded) {
    return;
  }

  // City filtering
  if (config.filterCities.length > 0 && alert.cities && alert.cities.length > 0) {
    const matchingCities = alert.cities.filter((city) =>
      config.filterCities.some((filter) => city === filter)
    );
    if (matchingCities.length === 0) {
      return;
    }
    alert.cities = matchingCities;
  }

  // At this point the alert matched our cities — always log this
  logger.info(`⚠ MATCHED ALERT: ${alert.type} → ${alert.cities.join(', ')}`, {
    id: alert.raw?.id,
    cat: alert.raw?.cat,
    title: alert.raw?.title,
  });

  // Dedup check (don't mark as seen yet)
  if (dedup.isDuplicate(alert)) {
    logger.info('↑ duplicate, skipping');
    return;
  }

  // Generate alert image and send
  let sent;
  try {
    const imageBuffer = await generateAlertImage(alert);
    sent = await whatsapp.sendImage(imageBuffer);
  } catch (err) {
    // Fallback to text message if image generation fails
    logger.warn('Image generation failed, falling back to text', { error: err.message });
    const message = formatAlertMessage(alert);
    sent = await whatsapp.sendMessage(message);
  }

  if (sent) {
    dedup.markSeen(alert);
    logger.info('✓ alert sent to WhatsApp');
  } else {
    logger.warn('✗ alert NOT sent — queued, will retry on next poll');
  }
}

// ------------------------------------------
// Start alert source
// ------------------------------------------
const pikudSource = new PikudHaorefSource({
  pollIntervalMs: config.pikudHaoref.pollIntervalMs,
  onAlert: handleAlert,
});
pikudSource.start();

// ------------------------------------------
// Start WhatsApp
// ------------------------------------------
whatsapp.initialize().catch((err) => {
  logger.error('Failed to initialize WhatsApp', { error: err.message });
  process.exit(1);
});

// ------------------------------------------
// Graceful shutdown
// ------------------------------------------
function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down...`);
  pikudSource.stop();
  whatsapp.destroy().then(() => {
    logger.info('Shutdown complete');
    process.exit(0);
  }).catch(() => process.exit(1));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: reason?.toString() });
});

logger.info('Bot is running. Waiting for alerts...');
