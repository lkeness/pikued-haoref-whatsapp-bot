module.exports = {
  apps: [
    {
      name: 'red-alert-whatsapp',
      script: 'src/index.js',
      autorestart: true,
      max_restarts: 50,
      min_uptime: '10s',
      restart_delay: 3000,
      exp_backoff_restart_delay: 1000,
      kill_timeout: 10000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '300M',
      merge_logs: true,
    },
  ],
};
