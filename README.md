# 🚨 Pikud Haoref Whatsapp Bot

Israeli Pikud Haoref (Home Command) to WhatsApp group bot. Forwards rocket and security alerts to a WhatsApp group in real time, with image cards, city filtering, and a maintenance channel for remote management.

> **Requires an Israeli IP address** — the Pikud HaOref API is geo-restricted.

## Quick start

```bash
nvm use                # switch to the pinned Node version (.nvmrc)
npm install
npm run setup          # pair WhatsApp + get your group ID
cp .env.example .env   # then fill in the group IDs
npm start              # run the bot via pm2
```

## Setup

### 1. Install

```bash
git clone https://github.com/lkeness/pikued-haoref-whatsapp-bot.git
cd pikued-haoref-whatsapp-bot
nvm use
npm install
```

Requires Node.js 18+ (pinned via `.nvmrc`).

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

```bash
cp .env.example .env
```

| Variable                         | Required | Default   | Description                                            |
| -------------------------------- | -------- | --------- | ------------------------------------------------------ |
| `WHATSAPP_GROUP_ID`              | **Yes**  | —         | Group ID for alert messages                            |
| `MAINTENANCE_GROUP_ID`           | No       | —         | Separate group for bot operators (status, commands)    |
| `FILTER_CITIES`                  | No       | all       | Comma-separated Hebrew city names to filter for        |
| `ADJACENT_CITIES`                | No       | none      | Nearby cities — triggers informational (orange) alerts |
| `PIKUD_HAOREF_POLL_INTERVAL_MS`  | No       | `3000`    | How often to poll the Oref API (ms)                    |
| `SEND_EVENT_ENDED`               | No       | `true`    | Forward "event ended" messages                         |
| `DEDUP_WINDOW_MS`                | No       | `180000`  | Suppress duplicate alerts within this window (ms)      |
| `MAINTENANCE_STATUS_INTERVAL_MS` | No       | `1800000` | Auto-send status to maintenance group (ms)             |
| `MAX_QUEUE_AGE_MS`               | No       | `180000`  | Drop queued messages older than this (ms)              |
| `LOG_LEVEL`                      | No       | `info`    | `debug`, `info`, `warn`, or `error`                    |

City names must match exactly as they appear in the Pikud HaOref API (Hebrew).

### 4. Run

**Start (pm2, recommended):**

```bash
npm start              # starts via ecosystem.config.cjs + tails logs
```

**Other pm2 commands:**

```bash
npm run status         # check if running
npm run restart        # restart
npm run stop           # stop
npm run flush-logs     # clear log files
npm run setup:logs     # one-time: configure pm2 log rotation
```

**Auto-start on server reboot:**

```bash
pm2 startup            # follow the printed command
pm2 save
```

## Maintenance channel

Set `MAINTENANCE_GROUP_ID` to a separate WhatsApp group for bot operators. The bot sends automatic notifications (startup, shutdown, reconnections, periodic status) and responds to commands:

| Command       | Description                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `status`      | Full status: commit, uptime, connection, cities, alert stats, memory                                                |
| `ping`        | Check if bot is alive                                                                                               |
| `uptime`      | Quick uptime check                                                                                                  |
| `update`      | Pull latest code (`git fetch` + `rebase` + `nvm use` + `npm install`) and restart via pm2. Auto-reverts on failure. |
| `groups`      | List all WhatsApp groups + IDs                                                                                      |
| `queue`       | Show pending message queue                                                                                          |
| `queue clear` | Clear the message queue                                                                                             |
| `dedup`       | Show deduplication state                                                                                            |
| `dedup clear` | Clear dedup (allows re-sending recent alerts)                                                                       |
| `config`      | Show running configuration                                                                                          |
| `help`        | List available commands                                                                                             |

All commands also work with a `!` prefix (e.g. `!status`).

## Alert types

- **Direct alerts** — cities in your `FILTER_CITIES` list get a full red alert image card.
- **Adjacent alerts** — cities in `ADJACENT_CITIES` get an orange informational card (useful for nearby settlements).
- **Event ended** — forwarded when the "all clear" is given (disable with `SEND_EVENT_ENDED=false`).

## Testing

```bash
npm test               # send a mock alert to verify the pipeline
```

## Troubleshooting

**No alerts / "Request timed out"** — You need an Israeli IP. Use a VPN or host the bot on a server in Israel.

**WhatsApp 405 errors** — The Baileys version number may be outdated. Check the latest version and update `@whiskeysockets/baileys` in `package.json`.

**QR code keeps appearing** — Delete `./whatsapp-session-baileys/` and re-run `npm run setup`.

**Duplicate alerts** — Increase `DEDUP_WINDOW_MS` in `.env`.

**Bot not responding to commands** — Make sure `MAINTENANCE_GROUP_ID` in `.env` matches the maintenance group. Check `pm2 logs` for errors.
