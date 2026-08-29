const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const path = require("path");

const config = require("./config.js");
const { loadPlugins, findCommand } = require("./sidd.js");
const { startPairServer } = require("./lib/pairServer.js");

const SESSION_PATH = path.join(__dirname, config.SESSION_DIR);

let sock = null;
let pendingPairingResolvers = [];

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["SIDD FREE BOT", "Chrome", "1.0.0"]
    });

    // If a phone number is provided via env var, auto-request a pairing code.
    // Otherwise the user requests it manually from the web UI (pair.html).
    if (!sock.authState.creds.registered && process.env.PHONE_NUMBER) {
        setTimeout(async () => {
            try {
                const phoneNumber = process.env.PHONE_NUMBER.replace(/[^0-9]/g, "");
                const code = await sock.requestPairingCode(phoneNumber);
                console.log("\n╭──────────────────────────╮");
                console.log("│      PAIRING CODE         │");
                console.log("╰──────────────────────────╯");
                console.log(`\n  ${code}\n`);

                resolvePendingPairing(null, code);
            } catch (err) {
                console.log("✗ Failed to generate pairing code:", err.message);
                resolvePendingPairing(err, null);
            }
        }, 3000);
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "close") {
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log("⚠ Connection closed.", statusCode ? `Status: ${statusCode}` : "");

            if (shouldReconnect) {
                console.log("↻ Reconnecting...");
                startBot();
            } else {
                console.log("✗ Logged out. Delete the session folder and restart to re-pair.");
            }
        } else if (connection === "open") {
            console.log("✓ Connected to WhatsApp");
        }
    });

    sock.ev.on("messages.upsert", async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages?.[0];
            if (!msg || !msg.message) return;

            // Ignore messages sent by the bot itself
            if (msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            if (!from) return;

            const body =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                msg.message.videoMessage?.caption ||
                "";

            if (!body || typeof body !== "string") return;
            if (!body.startsWith(config.PREFIX)) return;

            const withoutPrefix = body.slice(config.PREFIX.length).trim();
            if (!withoutPrefix) return;

            const [cmdName, ...args] = withoutPrefix.split(/\s+/);
            const command = findCommand(cmdName);
            if (!command) return;

            const m = {
                raw: msg,
                key: msg.key,
                from,
                sender: msg.key.participant || from,
                body,
                args,
                isGroup: from.endsWith("@g.us")
            };

            try {
                await command.callback(m, sock);
            } catch (pluginErr) {
                console.log(`✗ Error executing command "${command.pattern}":`, pluginErr.message);
            }
        } catch (err) {
            console.log("✗ Error handling message:", err.message);
        }
    });

    return sock;
}

function resolvePendingPairing(err, code) {
    for (const resolver of pendingPairingResolvers) {
        if (err) resolver.reject(err);
        else resolver.resolve(code);
    }
    pendingPairingResolvers = [];
}

/**
 * Request a pairing code for a given phone number via the web UI.
 * Used by the HTTP server (pair.html).
 */
async function requestPairingCodeForNumber(number) {
    if (!sock) throw new Error("Bot is not initialized yet");
    if (sock.authState?.creds?.registered) {
        throw new Error("Bot is already paired to a session");
    }

    const cleaned = number.replace(/[^0-9]/g, "");
    const code = await sock.requestPairingCode(cleaned);
    return code;
}

function boot() {
    console.log("╭──────────────────────────╮");
    console.log(`│     ${config.BOT_NAME}        │`);
    console.log("│   Plugin System Started  │");
    console.log("╰──────────────────────────╯\n");

    const { loaded, failed } = loadPlugins();

    console.log(`\n✓ ${loaded} plugins loaded${failed ? `, ${failed} failed` : ""}`);
    console.log("✓ Bot starting...\n");

    // Pairing web server always runs — needed both for the pairing UI
    // and so Railway detects an open port and doesn't kill the deploy.
    const port = process.env.PORT || 3000;
    startPairServer({
        port,
        onRequestCode: requestPairingCodeForNumber
    });

    startBot().catch(err => {
        console.log("✗ Fatal error starting bot:", err.message);
        process.exit(1);
    });
}

module.exports = { boot };
