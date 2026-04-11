// Uses symlink ~/henrique-bot -> actual bot path (avoids spaces in path issue with pm2)
const BOT_DIR = require('os').homedir() + '/henrique-bot'

module.exports = {
  apps: [{
    name: 'henrique-bot',
    script: BOT_DIR + '/node_modules/.bin/tsx',
    args: BOT_DIR + '/src/index.ts',
    interpreter: 'none',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    env: { NODE_ENV: 'production' },
  }]
}
