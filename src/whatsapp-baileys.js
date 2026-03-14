const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const logger = require('./logger');
const { atomicWriteSync, withTimeout } = require('./utils');
const { FALLBACK_WA_VERSION, QUEUE_FILE, SESSION_DIR, WA_BROWSER_ID } = require('./constants');

const baileysLogger = pino({ level: 'silent' });

const RESTART_INTERVAL_MS = 60 * 60 * 1000;
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SEND_TIMEOUT_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const QUEUE_RETRY_INTERVAL_MS = 30_000;

class WhatsAppClient {
  constructor({ groupId, onMessage, onDisconnect }) {
    this.groupId = groupId;
    this.ready = false;
    this.sock = null;
    this._messageQueue = [];
    this._restartTimer = null;
    this._healthCheckTimer = null;
    this._queueRetryTimer = null;
    this._restarting = false;
    this._reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    this._onMessage = onMessage || null;
    this._onDisconnect = onDisconnect || null;
    this._loadQueue();
  }

  get queueSize() {
    return this._messageQueue.length;
  }

  async initialize() {
    logger.info('WhatsApp: initializing...');
    await this._connect();

    const startTime = Date.now();
    while (!this.ready && Date.now() - startTime < 60_000) {
      await delay(500);
    }

    if (!this.ready) {
      throw new Error('WhatsApp connection timed out (60s)');
    }

    logger.info('WhatsApp: ready');
  }

  async _connect() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    let version = FALLBACK_WA_VERSION;
    try {
      const result = await fetchLatestBaileysVersion();
      if (result?.version) {
        version = result.version;
        logger.info('WhatsApp: fetched latest version', { version });
      }
    } catch {
      logger.info('WhatsApp: using fallback version', { version });
    }

    this.sock = makeWASocket({
      auth: state,
      logger: baileysLogger,
      version,
      printQRInTerminal: false,
      browser: WA_BROWSER_ID,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.info('WhatsApp: scan QR code');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        this.ready = false;
        this._cancelHealthCheck();
        this._cancelQueueRetry();

        logger.warn('WhatsApp: disconnected', { statusCode });

        if (this._onDisconnect) {
          this._onDisconnect(statusCode, shouldReconnect);
        }

        if (shouldReconnect && !this._restarting) {
          const delayMs = this._reconnectDelay;
          this._reconnectDelay = Math.min(this._reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
          logger.info(`WhatsApp: reconnecting in ${delayMs}ms`);
          await delay(delayMs);
          if (!this._restarting) this._connect();
        }
      } else if (connection === 'open') {
        logger.info('WhatsApp: connected');
        this.ready = true;
        this._reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        this._flushQueue();
        this._schedulePreventiveRestart();
        this._startHealthCheck();
        this._startQueueRetry();
      }
    });

    if (this._onMessage) {
      this.sock.ev.on('messages.upsert', ({ messages }) => {
        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;
          const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
          if (text) {
            const jid = msg.key.remoteJid;
            const trimmed = text.trim();
            setImmediate(() => {
              try {
                this._onMessage(jid, trimmed);
              } catch (err) {
                logger.debug('WhatsApp: message handler error', { error: err.message });
              }
            });
          }
        }
      });
    }
  }

  _schedulePreventiveRestart() {
    this._cancelPreventiveRestart();
    this._restartTimer = setTimeout(() => {
      logger.info('WhatsApp: preventive restart');
      this.restart();
    }, RESTART_INTERVAL_MS);
  }

  _cancelPreventiveRestart() {
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }
  }

  _startHealthCheck() {
    this._cancelHealthCheck();
    this._healthCheckTimer = setInterval(async () => {
      if (!this.ready || !this.sock) return;
      try {
        await withTimeout(this.sock.sendPresenceUpdate('available'), 10_000);
      } catch {
        logger.warn('WhatsApp: health check failed, triggering restart');
        this.restart();
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  _cancelHealthCheck() {
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
      this._healthCheckTimer = null;
    }
  }

  _startQueueRetry() {
    this._cancelQueueRetry();
    this._queueRetryTimer = setInterval(() => {
      if (this.ready && this._messageQueue.length > 0) {
        logger.info(`WhatsApp: retrying ${this._messageQueue.length} queued messages`);
        this._flushQueue();
      }
    }, QUEUE_RETRY_INTERVAL_MS);
  }

  _cancelQueueRetry() {
    if (this._queueRetryTimer) {
      clearInterval(this._queueRetryTimer);
      this._queueRetryTimer = null;
    }
  }

  restart() {
    if (this._restarting) return;
    this._restarting = true;
    this.ready = false;
    this._cancelPreventiveRestart();
    this._cancelHealthCheck();
    this._cancelQueueRetry();

    logger.info('WhatsApp: restarting socket...');

    try {
      this.sock.end(new Error('Restart'));
    } catch {
      // ignore
    }

    delay(3000).then(async () => {
      try {
        await this._connect();
        this._restarting = false;
      } catch (err) {
        logger.error('WhatsApp: restart failed, retrying in 30s', { error: err.message });
        setTimeout(() => {
          this._restarting = false;
          this.restart();
        }, 30_000);
      }
    });
  }

  clearQueue() {
    this._messageQueue = [];
    this._persistQueue();
    logger.info('WhatsApp: queue cleared');
  }

  async sendMessage(text) {
    if (!this.groupId) {
      logger.error('WhatsApp: no group ID');
      return false;
    }

    if (!this.ready) {
      this._enqueue({ type: 'text', data: text });
      return false;
    }

    try {
      await withTimeout(this.sock.sendMessage(this.groupId, { text }), SEND_TIMEOUT_MS);
      return true;
    } catch (err) {
      logger.error('WhatsApp: send failed', { error: err.message });
      this._enqueue({ type: 'text', data: text });
      return false;
    }
  }

  async sendImage(imageBuffer, caption) {
    if (!this.groupId) {
      logger.error('WhatsApp: no group ID');
      return false;
    }

    if (!this.ready) {
      this._enqueue({ type: 'image', data: imageBuffer.toString('base64'), caption });
      return false;
    }

    try {
      const msg = { image: imageBuffer, mimetype: 'image/png' };
      if (caption) msg.caption = caption;
      await withTimeout(this.sock.sendMessage(this.groupId, msg), SEND_TIMEOUT_MS);
      return true;
    } catch (err) {
      logger.error('WhatsApp: image send failed', { error: err.message });
      this._enqueue({ type: 'image', data: imageBuffer.toString('base64'), caption });
      return false;
    }
  }

  async listGroups() {
    if (!this.ready || !this.sock) return [];
    try {
      const groupData = await withTimeout(this.sock.groupFetchAllParticipating(), SEND_TIMEOUT_MS);
      return Object.values(groupData).map((g) => ({ name: g.subject, id: g.id }));
    } catch (err) {
      logger.warn('WhatsApp: failed to list groups', { error: err.message });
      return [];
    }
  }

  async sendRaw(jid, content) {
    if (!this.ready || !this.sock) return false;
    try {
      await withTimeout(this.sock.sendMessage(jid, content), SEND_TIMEOUT_MS);
      return true;
    } catch (err) {
      logger.warn('WhatsApp: raw send failed', { error: err.message, jid });
      return false;
    }
  }

  _enqueue(item) {
    this._messageQueue.push(item);
    this._persistQueue();
  }

  async _flushQueue() {
    while (this._messageQueue.length > 0 && this.ready) {
      const item = this._messageQueue[0];
      try {
        if (item.type === 'image') {
          const buffer = Buffer.from(item.data, 'base64');
          const msg = { image: buffer, mimetype: 'image/png' };
          if (item.caption) msg.caption = item.caption;
          await withTimeout(this.sock.sendMessage(this.groupId, msg), SEND_TIMEOUT_MS);
        } else {
          await withTimeout(
            this.sock.sendMessage(this.groupId, { text: item.data }),
            SEND_TIMEOUT_MS,
          );
        }
        this._messageQueue.shift();
        this._persistQueue();
        logger.info('WhatsApp: flushed queued message');
        await delay(1000);
      } catch (err) {
        logger.error('WhatsApp: flush failed, will retry', { error: err.message });
        break;
      }
    }
  }

  _persistQueue() {
    try {
      atomicWriteSync(QUEUE_FILE, JSON.stringify(this._messageQueue));
    } catch (err) {
      logger.error('WhatsApp: queue persistence failed', { error: err.message });
    }
  }

  _loadQueue() {
    try {
      if (!fs.existsSync(QUEUE_FILE)) return;
      const data = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
      if (Array.isArray(data)) {
        this._messageQueue = data;
        logger.info('WhatsApp: loaded queued messages', { count: data.length });
      }
    } catch (err) {
      logger.warn('WhatsApp: could not load queue', { error: err.message });
    }
  }

  async destroy() {
    this._cancelPreventiveRestart();
    this._cancelHealthCheck();
    this._cancelQueueRetry();
    this._persistQueue();
    try {
      this.sock?.end(undefined);
    } catch {
      // ignore
    }
    logger.info('WhatsApp: destroyed');
  }
}

module.exports = WhatsAppClient;
