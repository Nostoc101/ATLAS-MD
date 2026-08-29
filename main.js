const {
    default: makeWASocket,
    useMultiFileAuthState,
    useInMemoryAuthState,      // ← ajouté pour le socket temporaire
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

    // Code auto si variable d'environnement définie (inchangé)
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

            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                console.log("✗ Logged out. Delete the session folder and restart to re-pair.");
                sock.ev.removeAllListeners();
                return;
            }

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

            // Auto-follow channels (inchangé)
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

            try {
                if (config.GROUP_INVITE_CODE && typeof sock.groupAcceptInvite === "function") {
                    await sock.groupAcceptInvite(config.GROUP_INVITE_CODE);
                    console.log(`✓ Auto-joined group code: ${config.GROUP_INVITE_CODE}`);
                }
            } catch (e) {
                console.log(`✗ Failed to auto-join group: ${e.message}`);
            }

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
            if (msg.key.fromMe) return;

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
 * Nouvelle version : crée un socket temporaire pour générer le code.
 * Évite les problèmes de connexion fermée.
 */
async function requestPairingCodeForNumber(number) {
    // Si le bot principal est déjà appairé, on refuse (sinon on déconnecterait la session)
    if (sock && sock.authState?.creds?.registered) {
        throw new Error("Bot is already paired to a session. Cannot generate a new pairing code.");
    }

    // État en mémoire (aucun fichier écrit)
    const { state, saveCreds } = useInMemoryAuthState();
    const { version } = await fetchLatestBaileysVersion();
    const logger = require("pino")({ level: "silent" });

    const tempSock = makeWASocket({
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

    return new Promise((resolve, reject) => {
        let resolved = false;
        const timeout = setTimeout(() => {
            if (!resolved) {
                tempSock.ev.removeAllListeners();
                reject(new Error("Timeout while requesting pairing code"));
            }
        }, 60000);

        tempSock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === "open") {
                try {
                    const cleaned = number.replace(/[^0-9]/g, "");
                    const code = await tempSock.requestPairingCode(cleaned);
                    clearTimeout(timeout);
                    resolved = true;
                    tempSock.ev.removeAllListeners();
                    if (tempSock.end) tempSock.end(); // fermeture propre
                    resolve(code);
                } catch (err) {
                    clearTimeout(timeout);
                    resolved = true;
                    tempSock.ev.removeAllListeners();
                    reject(err);
                }
            } else if (connection === "close") {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                if (!resolved) {
                    clearTimeout(timeout);
                    resolved = true;
                    tempSock.ev.removeAllListeners();
                    reject(new Error(`Connection closed with status ${statusCode}`));
                }
            }
        });
    });
}

function boot() {
    console.log("╭──────────────────────────╮");
    console.log(`│     ${config.BOT_NAME}        │`);
    console.log("│   Plugin System Started  │");
    console.log("╰──────────────────────────╯\n");

    const { loaded, failed } = loadPlugins();
    console.log(`\n✓ ${loaded} plugins loaded${failed ? `, ${failed} failed` : ""}`);
    console.log("✓ Bot starting...\n");

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