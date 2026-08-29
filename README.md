# SIDD FREE BOT

WhatsApp multi-device bot built with [Baileys](https://github.com/WhiskeySockets/Baileys).

**MADE IN BAY SIDD TECHX**

---

## Installation

```bash
npm install
```

## Start

```bash
npm start
```

A web server always starts alongside the bot (on `PORT` env var if set, otherwise `3000`). Open it in your browser to pair:

```
http://localhost:3000
```

Enter your WhatsApp number and get your pairing code, then enter it in WhatsApp under **Linked Devices → Link with phone number**.

The session is saved in the `session/` folder. On future restarts, if a valid session exists, no new pairing code is needed.

### Optional: auto-pairing via environment variable

Set `PHONE_NUMBER` and the bot will request a pairing code automatically on startup and print it to the logs — no need to visit the web UI:

```bash
PHONE_NUMBER=15551234567 npm start
```

### Deploying on Railway

No extra configuration needed. Railway sets `PORT` automatically and the bot's web server binds to it, so the public domain works out of the box. Just open the Railway-generated domain to pair.

---

## Commands

| Command | Alias | Description        |
|---------|-------|---------------------|
| `.ping`   | `.p`  | Check bot speed     |
| `.alive`  | —     | Check bot status    |
| `.menu`   | `.help` | Show all commands |

---

## Adding a new command

Create a new file in `plugins/`, for example `plugins/test.js`:

```javascript
const { cmd } = require("../sidd.js");
const config = require("../config.js");

cmd({
    pattern: "test",
    alias: [],
    desc: "A test command",
    category: "main"
}, async (m, sock) => {
    await sock.sendMessage(m.from, { text: "Test command works!" }, { quoted: m.raw });
});
```

Restart the bot. `plugins/test.js` will be automatically detected and loaded — no need to edit `main.js`, `sidd.js`, or `menu.js`. The new `.test` command will also appear automatically in `.menu`.

---

## Project structure

```
SIDD-FREE-BOT/
│
├── data/           # reserved for future bot data
├── lib/            # helper modules (pairing web server)
├── plugins/        # all bot commands
│   ├── ping.js
│   ├── alive.js
│   └── menu.js
│
├── main.js         # connection, reconnection, message handling
├── sidd.js         # plugin/command system core
├── config.js       # central configuration
├── index.js        # entry point
├── pair.html        # web pairing interface
├── package.json
└── README.md
```

---

## Known issue: Pairing Code

WhatsApp has a server-side regression (`companion_reg_refresh`) currently breaking `requestPairingCode` across all Baileys versions. This is tracked upstream in Baileys issue #2737 (fix in PR #2765, not yet merged as of this writing). If pairing fails, check the status of that PR/issue before assuming your setup is broken.
