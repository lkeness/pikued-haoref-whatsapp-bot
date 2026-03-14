const logger = require('./logger');
const { formatTimestamp } = require('./utils');

class MaintenanceChannel {
  constructor({ whatsapp, groupId }) {
    this.whatsapp = whatsapp;
    this.groupId = groupId;
    this._statusTimer = null;
    this._stats = {
      startedAt: Date.now(),
      alertsSent: 0,
      alertsFailed: 0,
      lastAlertAt: null,
      lastPollAt: null,
      reconnections: 0,
    };
  }

  get enabled() {
    return !!this.groupId;
  }

  recordAlertSent() {
    this._stats.alertsSent++;
    this._stats.lastAlertAt = Date.now();
  }

  recordAlertFailed() {
    this._stats.alertsFailed++;
  }

  recordPoll() {
    this._stats.lastPollAt = Date.now();
  }

  recordReconnection() {
    this._stats.reconnections++;
  }

  async sendStartup(config) {
    if (!this.enabled) return;
    const lines = [
      '🟢 *Alert Bot Online*',
      '',
      `🕐 ${formatTimestamp()}`,
      `⏱ Poll: ${config.pikudHaoref.pollIntervalMs}ms`,
      `🏙 Filter: ${config.filterCities.length > 0 ? config.filterCities.join(', ') : 'ALL'}`,
      `📨 Event ended: ${config.sendEventEnded ? 'Yes' : 'No'}`,
      `📋 Queue: ${this.whatsapp.queueSize} pending`,
    ];
    await this._send(lines.join('\n'));
  }

  async sendShutdown(signal) {
    if (!this.enabled) return;
    const lines = [
      '🔴 *Alert Bot Shutting Down*',
      '',
      `🕐 ${formatTimestamp()}`,
      `Signal: ${signal}`,
      `📋 Queue: ${this.whatsapp.queueSize} pending`,
      `⏱ Uptime: ${this._formatUptime()}`,
    ];
    await this._send(lines.join('\n'));
  }

  async sendError(context, error) {
    if (!this.enabled) return;
    const lines = [
      `🔴 *Error: ${context}*`,
      '',
      `🕐 ${formatTimestamp()}`,
      `${error.message || String(error)}`,
    ];
    await this._send(lines.join('\n'));
  }

  async sendReconnection(statusCode, willRetry) {
    if (!this.enabled) return;
    this.recordReconnection();
    const lines = [
      '🟡 *WhatsApp Reconnecting*',
      '',
      `🕐 ${formatTimestamp()}`,
      `Status: ${statusCode || 'unknown'}`,
      `Will retry: ${willRetry ? 'Yes' : 'No'}`,
      `Total reconnections: ${this._stats.reconnections}`,
    ];
    await this._send(lines.join('\n'));
  }

  async sendStatus() {
    if (!this.enabled) return;
    await this._send(this._formatStatus());
  }

  handleCommand(text) {
    const cmd = text.trim().toLowerCase();
    if (cmd === 'status' || cmd === '!status') {
      return this._formatStatus();
    }
    if (cmd === 'ping' || cmd === '!ping') {
      return '🏓 Pong!';
    }
    if (cmd === 'help' || cmd === '!help') {
      return [
        '📖 *Available Commands*',
        '',
        '• status / !status — Full status report',
        '• ping / !ping — Check if bot is alive',
        '• help / !help — This message',
      ].join('\n');
    }
    return null;
  }

  startPeriodicStatus(intervalMs) {
    if (!this.enabled) return;
    this.stopPeriodicStatus();
    this._statusTimer = setInterval(() => {
      this.sendStatus().catch((err) => {
        logger.warn('Maintenance: periodic status failed', { error: err.message });
      });
    }, intervalMs);
  }

  stopPeriodicStatus() {
    if (this._statusTimer) {
      clearInterval(this._statusTimer);
      this._statusTimer = null;
    }
  }

  _formatStatus() {
    const now = Date.now();
    const lastPollAgo = this._stats.lastPollAt
      ? `${Math.round((now - this._stats.lastPollAt) / 1000)}s ago`
      : 'never';
    const lastAlert = this._stats.lastAlertAt
      ? `${Math.round((now - this._stats.lastAlertAt) / 1000)}s ago`
      : 'none';
    const mem = process.memoryUsage();

    return [
      '📊 *Bot Status*',
      '',
      `⏱ Uptime: ${this._formatUptime()}`,
      `📡 WhatsApp: ${this.whatsapp.ready ? '✅ connected' : '❌ disconnected'}`,
      `🔄 Last poll: ${lastPollAgo}`,
      `📨 Sent: ${this._stats.alertsSent}`,
      `❌ Failed: ${this._stats.alertsFailed}`,
      `🕐 Last alert: ${lastAlert}`,
      `📋 Queue: ${this.whatsapp.queueSize} pending`,
      `🔄 Reconnections: ${this._stats.reconnections}`,
      `💾 Memory: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
      '',
      `🕐 ${formatTimestamp()}`,
    ].join('\n');
  }

  _formatUptime() {
    const ms = Date.now() - this._stats.startedAt;
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }

  async _send(text) {
    try {
      await this.whatsapp.sendRaw(this.groupId, { text });
    } catch (err) {
      logger.warn('Maintenance: send failed', { error: err.message });
    }
  }
}

module.exports = MaintenanceChannel;
