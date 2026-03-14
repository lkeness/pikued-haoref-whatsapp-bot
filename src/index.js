const config = require('./config');
const logger = require('./logger');
const { formatAlertMessage } = require('./alertTypes');
const AlertCategory = require('./alertCategories');
const { generateAlertImage } = require('./alertImage');
const AlertDeduplicator = require('./dedup');
const PikudHaorefSource = require('./pikudHaoref');
const WhatsAppClient = require('./whatsapp-baileys');
const MaintenanceChannel = require('./maintenance');

// Suppress libsignal stderr noise (harmless decryption warnings from offline messages)
const origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function (chunk, encoding, callback) {
  const str = typeof chunk === 'string' ? chunk : chunk.toString();
  if (
    str.includes('Bad MAC') ||
    str.includes('Failed to decrypt') ||
    str.includes('No matching sessions') ||
    str.includes('Closing open session in favor')
  ) {
    if (typeof callback === 'function') callback();
    return true;
  }
  return origStderrWrite(chunk, encoding, callback);
};

if (!config.whatsappGroupId) {
  logger.error('WHATSAPP_GROUP_ID is not set. Run `npm run setup` first, then add it to .env');
  process.exit(1);
}

logger.info('Starting Red Alert WhatsApp Bot', {
  pollIntervalMs: config.pikudHaoref.pollIntervalMs,
  filterCities: config.filterCities.length > 0 ? config.filterCities : 'ALL',
  groupId: config.whatsappGroupId,
  maintenanceGroup: config.maintenanceGroupId ? 'configured' : 'none',
});

const dedup = new AlertDeduplicator(config.dedupWindowMs);

let maintenance;

const whatsapp = new WhatsAppClient({
  groupId: config.whatsappGroupId,
  onMessage: (jid, text) => {
    if (config.maintenanceGroupId && jid === config.maintenanceGroupId && maintenance?.enabled) {
      const response = maintenance.handleCommand(text);
      if (response) {
        whatsapp.sendRaw(jid, { text: response }).catch(() => {});
      }
    }
  },
  onDisconnect: (statusCode, willRetry) => {
    if (maintenance) {
      maintenance.sendReconnection(statusCode, willRetry).catch(() => {});
    }
  },
});

maintenance = new MaintenanceChannel({
  whatsapp,
  groupId: config.maintenanceGroupId,
});

async function handleAlert(alert) {
  if (alert.cat === AlertCategory.EVENT_ENDED && !config.sendEventEnded) {
    return;
  }

  const totalCities = alert.cities?.length || 0;

  if (config.filterCities.length > 0 && alert.cities && totalCities > 0) {
    const matchingCities = alert.cities.filter((city) =>
      config.filterCities.some((filter) => city === filter),
    );
    if (matchingCities.length === 0) return;
    alert.cities = matchingCities;
  }

  logger.info(
    `⚠ ALERT: cat=${alert.cat} "${alert.title}" (${alert.cities?.length || 0}/${totalCities} cities)`,
    { id: alert.raw?.id, cat: alert.cat, title: alert.title },
  );

  if (dedup.isDuplicate(alert)) {
    logger.info('Duplicate, skipping');
    return;
  }

  let sent;
  try {
    const imageBuffer = await generateAlertImage(alert);
    sent = await whatsapp.sendImage(imageBuffer);
  } catch (err) {
    logger.warn('Image failed, sending text', { error: err.message });
    const message = formatAlertMessage(alert);
    sent = await whatsapp.sendMessage(message);
  }

  if (sent) {
    dedup.markSeen(alert);
    logger.info('Alert delivered');
    maintenance.recordAlertSent();
  } else {
    logger.warn('Alert queued for retry');
  }
}

let pikudSource = null;

async function start() {
  try {
    await whatsapp.initialize();
  } catch (err) {
    logger.error('Failed to connect WhatsApp', { error: err.message });
    await maintenance.sendError('Startup failed', err).catch(() => {});
    process.exit(1);
  }

  await maintenance.sendStartup(config);
  maintenance.startPeriodicStatus(config.maintenanceStatusIntervalMs);

  pikudSource = new PikudHaorefSource({
    pollIntervalMs: config.pikudHaoref.pollIntervalMs,
    onAlert: handleAlert,
    onAlertIdChange: (id) => dedup.setLastAlertId(id),
    onPoll: () => maintenance.recordPoll(),
    lastAlertId: dedup.lastAlertId,
  });
  pikudSource.start();

  logger.info('Bot is running. Waiting for alerts...');
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down...`);

  if (pikudSource) pikudSource.stop();
  maintenance.stopPeriodicStatus();
  await maintenance.sendShutdown(signal).catch(() => {});

  try {
    await whatsapp.destroy();
  } catch {
    // ignore
  }

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  whatsapp._persistQueue();
  maintenance
    .sendError('Uncaught exception', err)
    .catch(() => {})
    .finally(() => process.exit(1));
  setTimeout(() => process.exit(1), 3000);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: reason?.toString() });
  whatsapp._persistQueue();
  maintenance
    .sendError('Unhandled rejection', { message: reason?.toString() })
    .catch(() => {})
    .finally(() => process.exit(1));
  setTimeout(() => process.exit(1), 3000);
});

start();
