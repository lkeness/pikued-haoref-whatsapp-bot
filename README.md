# 🚨 Pikud Haoref Whatsapp Bot

Israeli Pikud Haoref (Home Command) to WhatsApp group bot. Forwards rocket and security alerts to a WhatsApp group in real time.

> **Requires an Israeli IP address** — the Pikud HaOref API is geo-restricted.

## Quick start

```bash
npm install
npm run setup       # pair WhatsApp + get your group ID
# paste group ID into .env (see below)
npm start           # run the bot
npm test            # send a mock alert for testing
```

## Setup

### 1. Install

```bash
git clone https://github.com/lkeness/pikued-haoref-whatsapp-bot.git
cd pikued-haoref-whatsapp-bot
npm install
```

Requires Node.js 18+.

### 2. Pair WhatsApp

```bash
npm run setup
```

A QR code will appear in your terminal. To scan it:

1. Open WhatsApp on your phone.
2. Go to **Settings → Linked Devices → Link a Device**.
3. Point your camera at the QR code in the terminal.

Once paired, the script lists all your WhatsApp groups with their IDs:

```
  📌 "Family Alerts"
     ID: 120363012345678901@g.us

  📌 "Work Group"
     ID: 120363098765432101@g.us
```

Copy the ID of the group you want alerts sent to. It's a long number ending in `@g.us`.

**If the group list doesn't load:** the script will fall back to a listener. Send the message `!groupid` inside the WhatsApp group you want to use, and the ID will print in the terminal.

The pairing session is saved to `./whatsapp-session-baileys/` so you won't need to scan again unless you log out or delete that folder.

### 3. Configure `.env`

Create a `.env` file in the project root. You can copy the example file and edit it:

```bash
cp .env.example .env
```

Then update the values as needed:

```env
# Required — paste your group ID from step 2
WHATSAPP_GROUP_ID=120363012345678901@g.us

# Optional — only forward alerts for these cities (Hebrew, comma-separated)
# Omit this line to receive ALL alerts nationwide
FILTER_CITIES=תל אביב - יפו,חיפה,באר שבע

# Optional — polling interval in ms (default: 3000)
PIKUD_HAOREF_POLL_INTERVAL_MS=3000

# Optional — dedup window in ms (default: 60000)
DEDUP_WINDOW_MS=60000

# Optional — suppress "event ended" messages (default: true)
SEND_EVENT_ENDED=true

# Optional — log level: error, warn, info, debug (default: info)
LOG_LEVEL=info
```

City names must match exactly as they appear in the Pikud HaOref API (Hebrew). You can find the full list in `translations.json`.

### 4. Run

**Manually:**

```bash
npm start
```

**In production (recommended)** — use [pm2](https://pm2.keymetrics.io/) to run the bot in the background with auto-restart:

```bash
npm install -g pm2
pm2 start src/index.js --name red-alert-whatsapp

# Useful commands
pm2 logs red-alert-whatsapp      # tail logs
pm2 status                       # check if running
pm2 restart red-alert-whatsapp   # restart
pm2 stop red-alert-whatsapp      # stop

# Auto-start on server reboot (one-time)
pm2 startup                      # follow the printed command
pm2 save
```

## Troubleshooting

**No alerts / "Request timed out"** — You need an Israeli IP. Use a VPN or host the bot on a server in Israel.

**WhatsApp 405 errors** — The Baileys version number is outdated. Check https://wppconnect.io/whatsapp-versions/ for the latest version and update the `version` array in `whatsapp-baileys.js`.

**QR code keeps appearing** — Delete `./whatsapp-session-baileys/` and re-run `npm run setup`.

**Duplicate alerts** — Increase `DEDUP_WINDOW_MS` in `.env`.
