const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    delay,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidNormalizedUser
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
    const logger = require("pino")({ level: "silent" });

    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        printQRInTerminal: false,
        logger,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        browser: ["SIDD FREE BOT", "Chrome", "1.0.0"]
    });

    // If a phone number is provided via env var, auto-request a pairing code.
    // Otherwise the user requests it manually from the web UI (pair.html).
    if (!sock.authState.creds.registered && process.env.PHONE_NUMBER) {
        setTimeout(async () => {
            try {
                await delay(1500);
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

    let connectedMessageSent = false;
    let restartAttempts = 0;
    const maxRestartAttempts = 3;

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "close") {
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message;

            // Session logged out / manually unlinked -> full cleanup, no reconnect
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                console.log("✗ Logged out. Delete the session folder and restart to re-pair.");
                sock.ev.removeAllListeners();
                return;
            }

            // Normal closure at the end of a QR/pairing cycle -> no reconnect
            const isNormalPairingClosure =
                statusCode === 408 || (errorMessage && errorMessage.includes("QR refs attempts ended"));
            if (isNormalPairingClosure) {
                console.log("⚠ Pairing cycle closed normally (no active session yet).");
                sock.ev.removeAllListeners();
                return;
            }

            console.log("⚠ Connection closed.", statusCode ? `Status: ${statusCode}` : "");

            if (restartAttempts < maxRestartAttempts) {
                restartAttempts++;
                console.log(`↻ Reconnecting (${restartAttempts}/${maxRestartAttempts})...`);
                sock.ev.removeAllListeners();
                startBot();
            } else {
                console.log("✗ Max reconnect attempts reached.");
                sock.ev.removeAllListeners();
            }
        } else if (connection === "open") {
            restartAttempts = 0;
            console.log("✓ Connected to WhatsApp");

            // Auto-follow newsletter channels
            for (const channelJid of config.NEWSLETTER_JIDS) {
                try {
                    if (typeof sock.newsletterFollow === "function") {
                        await sock.newsletterFollow(channelJid);
                        console.log(`✓ Auto-followed channel: ${channelJid}`);
                    } else if (typeof sock.subscribeNewsletter === "function") {
                        await sock.subscribeNewsletter(channelJid);
                        console.log(`✓ Auto-subscribed channel: ${channelJid}`);
                    }
                } catch (e) {
                    console.log(`✗ Failed to auto-follow channel ${channelJid}: ${e.message}`);
                }
            }

            // Auto-join group
            try {
                if (config.GROUP_INVITE_CODE && typeof sock.groupAcceptInvite === "function") {
                    await sock.groupAcceptInvite(config.GROUP_INVITE_CODE);
                    console.log(`✓ Auto-joined group code: ${config.GROUP_INVITE_CODE}`);
                }
            } catch (e) {
                console.log(`✗ Failed to auto-join group: ${e.message}`);
            }

            // Send connection confirmation message once
            if (!connectedMessageSent) {
                connectedMessageSent = true;
                try {
                    const userJid = jidNormalizedUser(sock.user.id);
                    await sock.sendMessage(userJid, {
                        text:
                            `╭━━━〔 ${config.BOT_NAME} 〕━━━╮\n` +
                            `│\n` +
                            `│ 🔥 Connected successfully\n` +
                            `│ ⚡ Type ${config.PREFIX}menu to see all commands\n` +
                            `│ 🔧 Prefix: ${config.PREFIX}\n` +
                            `│\n` +
                            `╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                            `${config.FOOTER}`
                    });
                } catch (connectMsgError) {
                    console.log(`✗ Failed to send connection message: ${connectMsgError.message}`);
                }
            }
        }
    });

    sock.ev.on("messages.upsert", async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages?.[0];
            if (!msg || !msg.message) return;

            // Ignore messages sent by the bot itself
            if (msg.key.fromMe) return;

            // Auto-react on channel/newsletter messages
            if (msg.key && config.NEWSLETTER_JIDS.includes(msg.key.remoteJid)) {
                try {
                    const autoReactEmojis = ["❤️", "🌟", "⏳", "💘", "🪐", "💫", "🔥", "👑"];
                    const serverId = msg.key.server_id;
                    if (serverId && typeof sock.newsletterReactMessage === "function") {
                        const randomReact = autoReactEmojis[Math.floor(Math.random() * autoReactEmojis.length)];
                        await sock.newsletterReactMessage(msg.key.remoteJid, String(serverId), randomReact);
                        console.log(`✓ Auto-reacted ${randomReact} on channel message ${serverId}`);
                    }
                } catch (e) {
                    console.log(`✗ Channel auto-react error: ${e.message}`);
                }
                return;
            }

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

    await delay(1500);
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
