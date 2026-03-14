module.exports = {
  apps: [
    {
      name: 'red-alert-whatsapp',
      script: 'src/index.js',
      autorestart: true,
      max_restarts: 50,
      restart_delay: 3000,
      exp_backoff_restart_delay: 1000,
    },
  ],
};
