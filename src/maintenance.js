const logger = require('./logger');
const { formatTimestamp } = require('./utils');

const MIN_SEND_INTERVAL_MS = 2_000;

class MaintenanceChannel {
  constructor({ whatsapp, groupId }) {
    this.whatsapp = whatsapp;
    this.groupId = groupId;
    this._statusTimer = null;
    this._lastSendAt = 0;
    this._sendQueue = [];
    this._draining = false;
    this._deps = {};
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

  setDeps({ dedup, config, pikudSource } = {}) {
    if (dedup) this._deps.dedup = dedup;
    if (config) this._deps.config = config;
    if (pikudSource) this._deps.pikudSource = pikudSource;
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

  notify(text) {
    if (!this.enabled) return;
    this._enqueueSend(text);
  }

  notifyStartup(config) {
    if (!this.enabled) return;
    try {
      const lines = [
        '🟢 *Alert Bot Online*',
        '',
        `🕐 ${formatTimestamp()}`,
        `⏱ Poll: ${config.pikudHaoref.pollIntervalMs}ms`,
        `🏙 Filter: ${config.filterCities.length > 0 ? config.filterCities.join(', ') : 'ALL'}`,
        `📨 Event ended: ${config.sendEventEnded ? 'Yes' : 'No'}`,
        `📋 Queue: ${this.whatsapp.queueSize} pending`,
      ];
      this._enqueueSend(lines.join('\n'));
    } catch (err) {
      logger.warn('Maintenance: notifyStartup failed', { error: err.message });
    }
  }

  notifyShutdown(signal) {
    if (!this.enabled) return;
    try {
      const lines = [
        '🔴 *Alert Bot Shutting Down*',
        '',
        `🕐 ${formatTimestamp()}`,
        `Signal: ${signal}`,
        `📋 Queue: ${this.whatsapp.queueSize} pending`,
        `⏱ Uptime: ${this._formatUptime()}`,
      ];
      return this._sendDirect(lines.join('\n'));
    } catch (err) {
      logger.warn('Maintenance: notifyShutdown failed', { error: err.message });
    }
  }

  notifyError(context, error) {
    if (!this.enabled) return;
    try {
      const lines = [
        `🔴 *Error: ${context}*`,
        '',
        `🕐 ${formatTimestamp()}`,
        `${error?.message || String(error)}`,
      ];
      this._enqueueSend(lines.join('\n'));
    } catch (err) {
      logger.warn('Maintenance: notifyError failed', { error: err.message });
    }
  }

  notifyReconnection(statusCode, willRetry) {
    if (!this.enabled) return;
    try {
      this.recordReconnection();
      const lines = [
        '🟡 *WhatsApp Reconnecting*',
        '',
        `🕐 ${formatTimestamp()}`,
        `Status: ${statusCode || 'unknown'}`,
        `Will retry: ${willRetry ? 'Yes' : 'No'}`,
        `Total reconnections: ${this._stats.reconnections}`,
      ];
      this._enqueueSend(lines.join('\n'));
    } catch (err) {
      logger.warn('Maintenance: notifyReconnection failed', { error: err.message });
    }
  }

  async handleCommand(text) {
    try {
      const parts = text.trim().toLowerCase().split(/\s+/);
      const cmd = parts[0];
      const arg = parts[1];

      switch (cmd) {
        case 'status':
        case '!status':
          return this._formatStatus();

        case 'ping':
        case '!ping':
          return '🏓 Pong!';

        case 'uptime':
        case '!uptime':
          return `⏱ Uptime: ${this._formatUptime()}`;

        case 'groups':
        case '!groups':
          return await this._cmdListGroups();

        case 'queue':
        case '!queue':
          return this._cmdQueue(arg);

        case 'dedup':
        case '!dedup':
          return this._cmdDedup(arg);

        case 'config':
        case '!config':
          return this._cmdConfig();

        case 'help':
        case '!help':
          return this._cmdHelp();

        default:
          return null;
      }
    } catch (err) {
      logger.warn('Maintenance: command failed', { text, error: err.message });
      return `❌ Command failed: ${err.message}`;
    }
  }

  startPeriodicStatus(intervalMs) {
    if (!this.enabled) return;
    this.stopPeriodicStatus();
    this._statusTimer = setInterval(() => {
      try {
        this._enqueueSend(this._formatStatus());
      } catch (err) {
        logger.warn('Maintenance: periodic status failed', { error: err.message });
      }
    }, intervalMs);
  }

  stopPeriodicStatus() {
    if (this._statusTimer) {
      clearInterval(this._statusTimer);
      this._statusTimer = null;
    }
  }

  async _cmdListGroups() {
    const groups = await this.whatsapp.listGroups();
    if (groups.length === 0) {
      return '❌ Could not fetch groups (disconnected or timeout)';
    }
    const lines = [`📋 *Groups (${groups.length})*`, ''];
    for (const g of groups) {
      lines.push(`• *${g.name}*`, `  ${g.id}`, '');
    }
    return lines.join('\n');
  }

  _cmdQueue(arg) {
    const size = this.whatsapp.queueSize;
    if (arg === 'clear') {
      this.whatsapp.clearQueue();
      return `🗑 Queue cleared (had ${size} messages).`;
    }
    return [`📋 *Message Queue*`, '', `Pending: ${size}`].join('\n');
  }

  _cmdDedup(arg) {
    const dedup = this._deps.dedup;
    if (!dedup) return '❌ Dedup not available.';

    if (arg === 'clear') {
      const count = dedup.seen.size;
      dedup.clear();
      return `🗑 Dedup state cleared (had ${count} entries).`;
    }

    const entries = [...dedup.seen.entries()];
    const lines = [
      `🔁 *Dedup State*`,
      '',
      `Window: ${Math.round(dedup.windowMs / 1000)}s`,
      `Entries: ${entries.length}`,
      `Last alert ID: ${dedup.lastAlertId || 'none'}`,
    ];
    if (entries.length > 0) {
      lines.push('');
      for (const [key, ts] of entries.slice(-10)) {
        const ago = Math.round((Date.now() - ts) / 1000);
        lines.push(`• ${key} (${ago}s ago)`);
      }
      if (entries.length > 10) {
        lines.push(`... and ${entries.length - 10} more`);
      }
    }
    return lines.join('\n');
  }

  _cmdConfig() {
    const cfg = this._deps.config;
    if (!cfg) return '❌ Config not available.';

    return [
      '⚙️ *Running Configuration*',
      '',
      `Poll interval: ${cfg.pikudHaoref.pollIntervalMs}ms`,
      `Filter cities: ${cfg.filterCities.length > 0 ? cfg.filterCities.join(', ') : 'ALL'}`,
      `Send event ended: ${cfg.sendEventEnded ? 'Yes' : 'No'}`,
      `Dedup window: ${cfg.dedupWindowMs / 1000}s`,
      `Maintenance status interval: ${cfg.maintenanceStatusIntervalMs / 60000}min`,
      `Queue max age: ${cfg.maxQueueAgeMs / 1000}s`,
      `Alert group: ${cfg.whatsappGroupId}`,
      `Maintenance group: ${cfg.maintenanceGroupId || 'none'}`,
    ].join('\n');
  }

  _cmdHelp() {
    return [
      '📖 *Available Commands*',
      '',
      '• *status* — Full status report',
      '• *ping* — Check if bot is alive',
      '• *uptime* — Quick uptime check',
      '• *groups* — List all WhatsApp groups + IDs',
      '• *queue* — Show pending message queue',
      '• *queue clear* — Clear the message queue',
      '• *dedup* — Show dedup state',
      '• *dedup clear* — Clear dedup (allows re-sending)',
      '• *config* — Show running configuration',
      '• *help* — This message',
    ].join('\n');
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

  _enqueueSend(text) {
    this._sendQueue.push(text);
    if (!this._draining) this._drainSendQueue();
  }

  async _drainSendQueue() {
    this._draining = true;
    while (this._sendQueue.length > 0) {
      const elapsed = Date.now() - this._lastSendAt;
      if (elapsed < MIN_SEND_INTERVAL_MS) {
        await new Promise((r) => setTimeout(r, MIN_SEND_INTERVAL_MS - elapsed));
      }
      const text = this._sendQueue.shift();
      await this._sendDirect(text);
    }
    this._draining = false;
  }

  async _sendDirect(text) {
    try {
      this._lastSendAt = Date.now();
      await this.whatsapp.sendRaw(this.groupId, { text });
    } catch (err) {
      logger.warn('Maintenance: send failed', { error: err.message });
    }
  }
}

module.exports = MaintenanceChannel;
