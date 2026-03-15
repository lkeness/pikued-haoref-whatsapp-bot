const config = require('./config');
const logger = require('./logger');
const { formatAlertMessage, isReleaseMessage } = require('./alertTypes');
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

const whatsapp = new WhatsAppClient({
  groupId: config.whatsappGroupId,
  onMessage: (jid, text) => {
    if (config.maintenanceGroupId && jid === config.maintenanceGroupId && maintenance.enabled) {
      maintenance
        .handleCommand(text)
        .then((response) => {
          if (response) whatsapp.sendRaw(jid, { text: response }).catch(() => {});
        })
        .catch(() => {});
    }
  },
  onDisconnect: (statusCode, willRetry) => {
    maintenance.notifyReconnection(statusCode, willRetry);
  },
});

const maintenance = new MaintenanceChannel({
  whatsapp,
  groupId: config.maintenanceGroupId,
});

maintenance.setDeps({ dedup, config });

async function handleAlert(alert) {
  if (isReleaseMessage(alert) && !config.sendEventEnded) {
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
    maintenance.recordAlertFailed();
  }
}

let pikudSource = null;

async function start() {
  try {
    await whatsapp.initialize();
  } catch (err) {
    logger.error('Failed to connect WhatsApp', { error: err.message });
    maintenance.notifyError('Startup failed', err);
    process.exit(1);
  }

  maintenance.notifyStartup(config);
  maintenance.startPeriodicStatus(config.maintenanceStatusIntervalMs);
  maintenance.startHttpInterface();

  pikudSource = new PikudHaorefSource({
    pollIntervalMs: config.pikudHaoref.pollIntervalMs,
    onAlert: handleAlert,
    onAlertIdChange: (id) => dedup.setLastAlertId(id),
    onPoll: () => maintenance.recordPoll(),
    lastAlertId: dedup.lastAlertId,
  });
  pikudSource.start();
  maintenance.setDeps({ pikudSource });

  logger.info('Bot is running. Waiting for alerts...');
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down...`);

  if (pikudSource) pikudSource.stop();
  maintenance.stopPeriodicStatus();
  maintenance.stopHttpInterface();

  try {
    await maintenance.notifyShutdown(signal);
  } catch {
    // best-effort — don't let maintenance block shutdown
  }

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
  maintenance.notifyError('Uncaught exception', err);
  setTimeout(() => process.exit(1), 3000);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: reason?.toString() });
  whatsapp._persistQueue();
  maintenance.notifyError('Unhandled rejection', { message: reason?.toString() });
  setTimeout(() => process.exit(1), 3000);
});

start();
