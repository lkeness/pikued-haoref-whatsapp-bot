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
const { atomicWriteSync, withTimeout, createMutex } = require('./utils');
const {
  FALLBACK_WA_VERSION,
  QUEUE_FILE,
  SESSION_DIR,
  WA_BROWSER_ID,
  HEALTH_CHECK_INTERVAL_MS,
  HEALTH_CHECK_TIMEOUT_MS,
  SEND_TIMEOUT_MS,
  INITIAL_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
  QUEUE_RETRY_INTERVAL_MS,
  QUEUE_FLUSH_DELAY_MS,
  CONNECTION_TIMEOUT_MS,
  CONNECTION_POLL_MS,
} = require('./constants');

const baileysLogger = pino({ level: 'silent' });

class WhatsAppClient {
  constructor({ groupId, onMessage, onDisconnect, maxQueueAgeMs = 180_000 }) {
    this.groupId = groupId;
    this.ready = false;
    this.sock = null;
    this._messageQueue = [];
    this._healthCheckTimer = null;
    this._queueRetryTimer = null;
    this._reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    this._onMessage = onMessage || null;
    this._onDisconnect = onDisconnect || null;
    this._maxQueueAgeMs = maxQueueAgeMs;
    this._sendMutex = createMutex();
    this._flushing = false;
    this._loadQueue();
  }

  get queueSize() {
    return this._messageQueue.length;
  }

  async initialize() {
    logger.info('WhatsApp: initializing...');
    await this._connect();

    const startTime = Date.now();
    while (!this.ready && Date.now() - startTime < CONNECTION_TIMEOUT_MS) {
      await delay(CONNECTION_POLL_MS);
    }

    if (!this.ready) {
      throw new Error(`WhatsApp connection timed out (${CONNECTION_TIMEOUT_MS / 1000}s)`);
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
          try {
            this._onDisconnect(statusCode, shouldReconnect);
          } catch {
            /* never let callback crash the reconnect flow */
          }
        }

        if (shouldReconnect) {
          const delayMs = this._reconnectDelay;
          this._reconnectDelay = Math.min(this._reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
          logger.info(`WhatsApp: reconnecting in ${delayMs}ms`);
          await delay(delayMs);
          this._connect();
        }
      } else if (connection === 'open') {
        logger.info('WhatsApp: connected');
        this.ready = true;
        this._reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        this._flushQueue();
        this._startHealthCheck();
        this._startQueueRetry();
      }
    });

    if (this._onMessage) {
      this.sock.ev.on('messages.upsert', ({ messages }) => {
        for (const msg of messages) {
          if (!msg.message) continue;
          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.ephemeralMessage?.message?.conversation ||
            msg.message.ephemeralMessage?.message?.extendedTextMessage?.text ||
            '';
          if (text) {
            const jid = msg.key.remoteJid;
            const trimmed = text.trim();
            const fromMe = !!msg.key.fromMe;
            logger.info('WhatsApp: message received', { jid, fromMe, text: trimmed });
            setImmediate(() => {
              try {
                this._onMessage(jid, trimmed, fromMe);
              } catch (err) {
                logger.debug('WhatsApp: message handler error', { error: err.message });
              }
            });
          }
        }
      });
    }
  }

  _startHealthCheck() {
    this._cancelHealthCheck();
    this._healthCheckTimer = setInterval(async () => {
      if (!this.ready || !this.sock) return;
      try {
        await withTimeout(this.sock.sendPresenceUpdate('available'), HEALTH_CHECK_TIMEOUT_MS);
      } catch {
        logger.warn('WhatsApp: health check failed, triggering reconnect');
        this._triggerReconnect();
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  _cancelHealthCheck() {
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
      this._healthCheckTimer = null;
    }
  }

  _triggerReconnect() {
    this.ready = false;
    this._cancelHealthCheck();
    this._cancelQueueRetry();
    try {
      this.sock?.end(new Error('Health check failed'));
    } catch {
      /* socket.end can throw if already closed */
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

  clearQueue() {
    this._messageQueue = [];
    this.persistQueue();
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

    return this._sendMutex(async () => {
      try {
        await withTimeout(this.sock.sendMessage(this.groupId, { text }), SEND_TIMEOUT_MS);
        return true;
      } catch (err) {
        logger.error('WhatsApp: send failed', { error: err.message });
        this._enqueue({ type: 'text', data: text });
        return false;
      }
    });
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

    return this._sendMutex(async () => {
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
    });
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
    return this._sendMutex(async () => {
      try {
        await withTimeout(this.sock.sendMessage(jid, content), SEND_TIMEOUT_MS);
        return true;
      } catch (err) {
        logger.warn('WhatsApp: raw send failed', { error: err.message, jid });
        return false;
      }
    });
  }

  _enqueue(item) {
    item.enqueuedAt = Date.now();
    this._messageQueue.push(item);
    this.persistQueue();
  }

  async _flushQueue() {
    if (this._flushing) return;
    this._flushing = true;
    try {
      this._dropExpired();
      while (this._messageQueue.length > 0 && this.ready) {
        const item = this._messageQueue[0];
        const success = await this._sendMutex(async () => {
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
          return true;
        }).catch(() => false);

        if (success) {
          this._messageQueue.shift();
          this.persistQueue();
          logger.info('WhatsApp: flushed queued message');
          await delay(QUEUE_FLUSH_DELAY_MS);
        } else {
          logger.error('WhatsApp: flush failed, will retry later');
          break;
        }
      }
    } finally {
      this._flushing = false;
    }
  }

  _dropExpired() {
    const now = Date.now();
    const before = this._messageQueue.length;
    this._messageQueue = this._messageQueue.filter((item) => {
      if (item.enqueuedAt && now - item.enqueuedAt > this._maxQueueAgeMs) {
        logger.warn('WhatsApp: dropping expired queued message', {
          ageMs: now - item.enqueuedAt,
          type: item.type,
        });
        return false;
      }
      return true;
    });
    if (this._messageQueue.length !== before) {
      this.persistQueue();
    }
  }

  persistQueue() {
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
    this._cancelHealthCheck();
    this._cancelQueueRetry();
    this.persistQueue();
    try {
      this.sock?.end(undefined);
    } catch {
      /* ignore */
    }
    logger.info('WhatsApp: destroyed');
  }
}

module.exports = WhatsAppClient;
