// ===========================================
// WhatsApp client using @whiskeysockets/baileys
// Handles Socket auth, session persistence,
// sending messages, and preventive restarts.
// ===========================================

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    delay 
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const logger = require('./logger');
const fs = require('fs');

const RESTART_INTERVAL_MS = 60 * 60 * 1000; // Preventive restart every 60 minutes

class WhatsAppClient {
  constructor({ groupId }) {
    this.groupId = groupId;
    this.ready = false;
    this.sock = null;
    this._messageQueue = [];
    this._restartTimer = null;
    this._restarting = false;
  }

  async initialize() {
    logger.info('WhatsApp (Baileys): initializing...');
    await this._connect();
  }

  async _connect() {
    // 1. Setup Auth State (Persistence)
    const { state, saveCreds } = await useMultiFileAuthState('./whatsapp-session-baileys');

    // 2. Initialize Socket
    // NOTE: version must be kept up to date — WhatsApp rejects outdated versions with 405.
    // Check https://wppconnect.io/whatsapp-versions/ for the latest tertiary number.
    this.sock = makeWASocket({
      auth: state,
      version: [2, 3000, 1034074495],
      printQRInTerminal: false, // We handle it manually via the 'qr' event equivalent
      browser: ['Alert Bot', 'Chrome', '1.0.0'],
    });

    // 3. Setup Event Handlers
    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Handle QR Code
      if (qr) {
        logger.info('WhatsApp: scan QR code');
        qrcode.generate(qr, { small: true });
      }

      // Handle Connection Status
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        this.ready = false;
        logger.warn('WhatsApp: disconnected', { reason: lastDisconnect?.error });

        if (shouldReconnect && !this._restarting) {
          this._connect();
        }
      } else if (connection === 'open') {
        logger.info('WhatsApp: connected');
        this.ready = true;
        this._flushQueue();
        this._schedulePreventiveRestart();
        // await this._sendStartupMessage(); // Yifat asked to remove
      }
    });
  }

  // ------------------------------------------
  // Startup confirmation
  // ------------------------------------------
  async _sendStartupMessage() {
    if (!this.groupId) return;
    const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const msg = `🟢 *בוט התרעות פעיל (Baileys) / Alert Bot Online*\n🕐 ${now}`;
    try {
      await this.sock.sendMessage(this.groupId, { text: msg });
      logger.info('WhatsApp: startup message sent');
    } catch (err) {
      logger.error('WhatsApp: startup message failed', { error: err.message });
    }
  }

  // ------------------------------------------
  // Preventive restart — avoids stale sockets
  // ------------------------------------------
  _schedulePreventiveRestart() {
    this._cancelPreventiveRestart();
    this._restartTimer = setTimeout(() => {
      logger.info('WhatsApp: preventive restart (scheduled)');
      this._restart();
    }, RESTART_INTERVAL_MS);
  }

  _cancelPreventiveRestart() {
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }
  }

  async _restart() {
    if (this._restarting) return;
    this._restarting = true;
    this.ready = false;
    this._cancelPreventiveRestart();

    logger.info('WhatsApp: restarting socket...');

    try {
      // Baileys doesn't need a heavy destroy, just end the socket
      this.sock.end(new Error('Preventive Restart'));
    } catch (err) {
      // ignore
    }

    await delay(3000);

    try {
      await this._connect();
      this._restarting = false;
    } catch (err) {
      logger.error('WhatsApp: restart failed, retrying in 30s', { error: err.message });
      setTimeout(() => {
        this._restarting = false;
        this._restart();
      }, 30000);
    }
  }

  /**
   * Send a text message to the configured group.
   */
  async sendMessage(text) {
    if (!this.groupId) {
      logger.error('WhatsApp: no group ID configured');
      return false;
    }

    if (!this.ready) {
      logger.warn('WhatsApp: not ready, queuing message');
      this._messageQueue.push({ type: 'text', data: text });
      return false;
    }

    try {
      await this.sock.sendMessage(this.groupId, { text: text });
      logger.info('WhatsApp: sent text to group');
      return true;
    } catch (err) {
      logger.error('WhatsApp: send failed', { error: err.message });
      this._messageQueue.push({ type: 'text', data: text });
      return false;
    }
  }

  /**
   * Send an image (PNG buffer) to the configured group.
   * @param {Buffer} imageBuffer - PNG image buffer
   * @param {string} [caption] - Optional caption text
   * @returns {boolean} true if sent
   */
  async sendImage(imageBuffer, caption) {
    if (!this.groupId) {
      logger.error('WhatsApp: no group ID configured');
      return false;
    }

    if (!this.ready) {
      logger.warn('WhatsApp: not ready, queuing image');
      this._messageQueue.push({ type: 'image', data: imageBuffer, caption });
      return false;
    }

    try {
      const msg = { image: imageBuffer, mimetype: 'image/png' };
      if (caption) msg.caption = caption;
      await this.sock.sendMessage(this.groupId, msg);
      logger.info('WhatsApp: sent image to group');
      return true;
    } catch (err) {
      logger.error('WhatsApp: image send failed', { error: err.message });
      this._messageQueue.push({ type: 'image', data: imageBuffer, caption });
      return false;
    }
  }

  async _flushQueue() {
    while (this._messageQueue.length > 0) {
      const item = this._messageQueue.shift();
      try {
        if (item.type === 'image') {
          const msg = { image: item.data, mimetype: 'image/png' };
          if (item.caption) msg.caption = item.caption;
          await this.sock.sendMessage(this.groupId, msg);
        } else {
          await this.sock.sendMessage(this.groupId, { text: item.data });
        }
        logger.info('WhatsApp: flushed queued message');
        await delay(1000);
      } catch (err) {
        logger.error('WhatsApp: flush failed', { error: err.message });
        this._messageQueue.unshift(item);
        break;
      }
    }
  }

  async destroy() {
    this._cancelPreventiveRestart();
    this.sock.end(undefined);
    logger.info('WhatsApp: destroyed');
  }
}

module.exports = WhatsAppClient;