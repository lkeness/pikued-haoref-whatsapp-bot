const config = require('./config');
const logger = require('./logger');
const { formatAlertMessage, isReleaseMessage } = require('./alertTypes');
const { generateAlertImage } = require('./alertImage');
const AlertDeduplicator = require('./dedup');
const PikudHaorefSource = require('./pikudHaoref');
const WhatsAppClient = require('./whatsapp-baileys');
const MaintenanceChannel = require('./maintenance');
const alertMetadata = require('./alertMetadata');
const { createMutex, formatDateParts } = require('./utils');
const { LIBSIGNAL_NOISE_PATTERNS, CRASH_EXIT_DELAY_MS } = require('./constants');

function isLibsignalNoise(str) {
  return LIBSIGNAL_NOISE_PATTERNS.some((p) => str.includes(p));
}

const origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function (chunk, encoding, callback) {
  const str = typeof chunk === 'string' ? chunk : chunk.toString();
  if (isLibsignalNoise(str)) {
    logger.debug('libsignal:', str.trim());
    if (typeof callback === 'function') callback();
    return true;
  }
  return origStderrWrite(chunk, encoding, callback);
};

const origStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function (chunk, encoding, callback) {
  const str = typeof chunk === 'string' ? chunk : chunk.toString();
  if (isLibsignalNoise(str)) {
    if (typeof callback === 'function') callback();
    return true;
  }
  return origStdoutWrite(chunk, encoding, callback);
};

logger.info('Starting Red Alert WhatsApp Bot', {
  pollIntervalMs: config.pikudHaoref.pollIntervalMs,
  filterCities: config.filterCities.length > 0 ? config.filterCities : 'ALL',
  groupId: config.whatsappGroupId,
  maintenanceGroup: config.maintenanceGroupId ? 'configured' : 'none',
});

const dedup = new AlertDeduplicator(config.dedupWindowMs);

const whatsapp = new WhatsAppClient({
  groupId: config.whatsappGroupId,
  maxQueueAgeMs: config.maxQueueAgeMs,
  onMessage: (jid, text, _fromMe) => {
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

const alertMutex = createMutex();

async function handleAlert(alert) {
  return alertMutex(async () => {
    if (isReleaseMessage(alert) && !config.sendEventEnded) {
      return true;
    }

    const totalCities = alert.cities?.length || 0;

    if (config.filterCities.length > 0 && alert.cities && totalCities > 0) {
      const matchingCities = alert.cities.filter((city) =>
        config.filterCities.some((filter) => city === filter),
      );
      if (matchingCities.length === 0) return true;
      alert.cities = matchingCities;
    }

    logger.info(
      `⚠ ALERT: cat=${alert.cat} "${alert.title}" (${alert.cities?.length || 0}/${totalCities} cities)`,
      { id: alert.raw?.id, cat: alert.cat, title: alert.title },
    );

    if (dedup.isDuplicate(alert)) {
      logger.info('Duplicate, skipping');
      return true;
    }

    let sent;
    const textMessage = formatAlertMessage(alert);

    try {
      const imageBuffer = await generateAlertImage(alert);
      const { time } = formatDateParts();
      const caption = time.slice(0, 5);
      sent = await whatsapp.sendImage(imageBuffer, caption);
    } catch (err) {
      logger.warn('Image failed, sending text', { error: err.message });
      sent = await whatsapp.sendMessage(textMessage);
    }

    dedup.markSeen(alert);

    if (sent) {
      logger.info('Alert delivered');
      maintenance.recordAlertSent();
      return true;
    }

    logger.warn('Alert queued for retry');
    maintenance.recordAlertFailed();
    return false;
  });
}

let pikudSource = null;

async function start() {
  await alertMetadata.load();

  try {
    await whatsapp.initialize();
  } catch (err) {
    logger.error('Failed to connect WhatsApp', { error: err.message });
    maintenance.notifyError('Startup failed', err);
    process.exit(1);
  }

  maintenance.notifyStartup(config);
  maintenance.startPeriodicStatus(config.maintenanceStatusIntervalMs);

  pikudSource = new PikudHaorefSource({
    pollIntervalMs: config.pikudHaoref.pollIntervalMs,
    onAlert: handleAlert,
    onAlertIdChange: (id) => dedup.setLastAlertId(id),
    onHistoryCheckpoint: (ts) => dedup.setLastHistoryTimestamp(ts),
    onPoll: () => maintenance.recordPoll(),
    lastAlertId: dedup.lastAlertId,
    lastHistoryTimestamp: dedup.lastHistoryTimestamp,
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
  alertMetadata.stop();
  maintenance.stopPeriodicStatus();

  try {
    await maintenance.notifyShutdown(signal);
  } catch {
    /* best-effort */
  }

  try {
    await whatsapp.destroy();
  } catch {
    /* ignore */
  }

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  try {
    whatsapp.persistQueue();
  } catch {
    /* best-effort */
  }
  try {
    maintenance.notifyError('Uncaught exception', err);
  } catch {
    /* best-effort */
  }
  setTimeout(() => process.exit(1), CRASH_EXIT_DELAY_MS);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: reason?.toString() });
  try {
    maintenance.notifyError('Unhandled rejection', { message: reason?.toString() });
  } catch {
    /* best-effort */
  }
});

start();
