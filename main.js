const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    jidNormalizedUser,
    Browsers,
    DisconnectReason,
    jidDecode,
    downloadContentFromMessage,
    getContentType,
} = require('@whiskeysockets/baileys');

const config = require('./config');
const { randomImage } = require('./lib/images');
const { fakevCard } = require('./lib/fakevCard');
const events = require('./sidd');
const { sms } = require('./lib/msg');
const {
    connectdb,
    saveSessionToMongoDB,
    getSessionFromMongoDB,
    deleteSessionFromMongoDB,
    getUserConfigFromMongoDB,
    updateUserConfigInMongoDB,
    addNumberToMongoDB,
    removeNumberFromMongoDB,
    getAllNumbersFromMongoDB,
    saveOTPToMongoDB,
    verifyOTPFromMongoDB,
    incrementStats,
    getStatsForNumber
} = require('./lib/database');
const { handleAntidelete } = require('./lib/antidelete');
const { isSudo } = require('./lib/sudo');
const { styleReply } = require('./lib/style');

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');
const crypto = require('crypto');
const FileType = require('file-type');
const axios = require('axios');
const moment = require('moment-timezone');

const prefix = config.PREFIX;
const mode = config.MODE || config.WORK_TYPE;
const router = express.Router();

// ========== ATLAS-ULTRA ROLES SYSTEM ==========
const MASTER_NUMBER = '2348142334779'; // CHANGE TO YOUR NUMBER
let ADMIN_NUMBERS = []; // Bot admins. Use!addadmin to add
let REMOTED_USERS = []; // Banned from using bot

function getUserRole(number, isGroupAdmin = false) {
    const num = number.replace(/[^0-9]/g, '');
    if (num === MASTER_NUMBER) return 'master';
    if (ADMIN_NUMBERS.includes(num)) return 'botadmin';
    if (isGroupAdmin) return 'groupadmin';
    return 'guest';
}
// ========== END ROLES ==========

connectdb();

const activeSockets = new Map();
const socketCreationTime = new Map();
const pairingRequests = new Map();
const pendingSockets = new Map();
const pendingCodes = new Map(); // you were missing this

function createSiddStore() {
    const store = {
        messages: {},
        bind(ev) {
            ev.on('messages.upsert', ({ messages }) => {
                for (const msg of messages) {
                    const jid = msg.key && msg.key.remoteJid;
                    if (!jid) continue;
                    if (!store.messages[jid]) store.messages[jid] = [];
                    store.messages[jid].push(msg);
                    if (store.messages[jid].length > 200) store.messages[jid].shift();
                }
            });
        },
        async loadMessage(jid, id) {
            if (!store.messages[jid]) return null;
            return store.messages[jid].find(m => m.key && m.key.id === id) || null;
        }
    };
    return store;
}

const createSerial = (size) => crypto.randomBytes(size).toString('hex').slice(0, size);

const getGroupAdmins = (participants) => {
    let admins = [];
    for (let i of participants) {
        if (i.admin == null) continue;
        admins.push(i.id);
    }
    return admins;
};

function isNumberAlreadyConnected(number) {
    return activeSockets.has(number.replace(/[^0-9]/g, ''));
}

function getConnectionStatus(number) {
    const n = number.replace(/[^0-9]/g, '');
    const isConnected = activeSockets.has(n);
    const connectionTime = socketCreationTime.get(n);
    return {
        isConnected,
        connectionTime: connectionTime? new Date(connectionTime).toLocaleString() : null,
        uptime: connectionTime? Math.floor((Date.now() - connectionTime) / 1000) : 0
    };
}

function siddLog(message, type = 'info') {
    const icons = { info: '📝', success: '✅', error: '❌', warning: '⚠️', debug: '🐛' };
    console.log(`${icons[type] || '📝'} [ATLAS-ULTRA] ${new Date().toISOString()}: ${message}`);
}

const pluginsDir = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
const pluginFiles = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
siddLog(`Loading ${pluginFiles.length} plugins...`, 'info');
for (const file of pluginFiles) {
    try { require(path.join(pluginsDir, file)); }
    catch (e) { siddLog(`Failed to load plugin ${file}: ${e.message}`, 'error'); }
}

async function setupCallHandlers(socket, number) {
    socket.ev.on('call', async (calls) => {
        try {
            const userConfig = await getUserConfigFromMongoDB(number);
            if (userConfig.ANTI_CALL!== 'true') return;
            for (const call of calls) {
                if (call.status!== 'offer') continue;
                await socket.rejectCall(call.id, call.from);
                await socket.sendMessage(call.from, { text: userConfig.REJECT_MSG || config.REJECT_MSG });
                siddLog(`Auto-rejected call for ${number} from ${call.from}`, 'info');
            }
        } catch (err) {
            siddLog(`Anti-call error for ${number}: ${err.message}`, 'error');
        }
    });
}

async function siddPair(number, res = null) {
    let connectionLockKey;
    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    try {
        const sessionPath = path.join(__dirname, 'session', `session_${sanitizedNumber}`);

        if (isNumberAlreadyConnected(sanitizedNumber)) {
            const status = getConnectionStatus(sanitizedNumber);
            if (res &&!res.headersSent) {
                return res.json({ status: 'already_connected', message: 'Number is already connected', connectionTime: status.connectionTime, uptime: `${status.uptime} seconds` });
            }
            return;
        }

        connectionLockKey = `sidd_lock_${sanitizedNumber}`;
        if (global[connectionLockKey]) {
            if (res &&!res.headersSent) return res.json({ status: 'connection_in_progress' });
            return;
        }
        global[connectionLockKey] = true;

        const existingSession = await getSessionFromMongoDB(sanitizedNumber);
        if (!existingSession) {
            siddLog(`No MongoDB session for ${sanitizedNumber} — new pairing required`, 'info');
            if (fs.existsSync(sessionPath)) await fs.remove(sessionPath);
        } else {
            fs.ensureDirSync(sessionPath);
            fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(existingSession, null, 2));
            siddLog(`🔄 Restored existing session from MongoDB for ${sanitizedNumber}`, 'success');
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const logger = pino({ level: process.env.NODE_ENV === 'production'? 'fatal' : 'debug' });
        const siddStore = createSiddStore();

        const conn = makeWASocket({
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: false,
            fireInitQueries: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: true,
            markOnlineOnConnect: true,
            browser: ['Mac OS', 'Safari', '10.15.7'],
            getMessage: async (key) => {
                const msg = await siddStore.loadMessage(key.remoteJid, key.id);
                return msg?.message || undefined;
            }
        });

        pendingSockets.set(sanitizedNumber, conn);
        siddStore.bind(conn.ev);
        setupCallHandlers(conn, number);

        conn.decodeJid = jid => {
            if (!jid) return jid;
            if (/:\d+@/gi.test(jid)) {
                const decode = jidDecode(jid) || {};
                return (decode.user && decode.server && decode.user + '@' + decode.server) || jid;
            }
            return jid;
        };

        conn.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
            const quoted = message.msg? message.msg : message;
            const mime = (message.msg || message).mimetype || '';
            const messageType = message.mtype? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
            const stream = await downloadContentFromMessage(quoted, messageType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            const type = await FileType.fromBuffer(buffer);
            const trueFileName = attachExtension? (filename + '.' + type.ext) : filename;
            await fs.writeFileSync(trueFileName, buffer);
            return trueFileName;
        };

        const wasAlreadyRegistered = conn.authState.creds.registered;
        if (!conn.authState.creds.registered) {
            siddLog(`🔐 Starting NEW pairing process for ${sanitizedNumber}`, 'info');
            try {
                await delay(1500);
                const code = await conn.requestPairingCode(sanitizedNumber);
                siddLog(`Pairing Code for ${sanitizedNumber}: ${code}`, 'success');
                if (res &&!res.headersSent) res.send({ code, status: 'new_pairing' });
            } catch (error) {
                siddLog(`Failed to request pairing code: ${error.message}`, 'error');
                if (res &&!res.headersSent) res.status(500).send({ error: 'Failed to get pairing code', status: 'error', message: error.message });
                throw error;
            }
        } else {
            siddLog(`✅ Using existing session for ${sanitizedNumber}`, 'success');
            if (res &&!res.headersSent) res.json({ status: 'reconnecting', message: 'Reconnecting with existing session' });
        }

        conn.ev.on('creds.update', async () => {
            await saveCreds();
            const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
            const creds = JSON.parse(fileContent);
            const existingSessionCheck = await getSessionFromMongoDB(sanitizedNumber);
            const isNewSession =!existingSessionCheck;
            await saveSessionToMongoDB(sanitizedNumber, creds);
            if (isNewSession) siddLog(`🎉 NEW user ${sanitizedNumber} successfully registered!`, 'success');
        });

        conn.ev.on('messages.update', async (updates) => { await handleAntidelete(conn, updates, siddStore); });

        let restartAttempts = 0;
        const maxRestartAttempts = 3;
        let connectedMessageSent = wasAlreadyRegistered;

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                activeSockets.set(sanitizedNumber, conn);
                pendingSockets.delete(sanitizedNumber);
                socketCreationTime.set(sanitizedNumber, Date.now());
                pairingRequests.delete(sanitizedNumber);
                pendingCodes.delete(sanitizedNumber);
                restartAttempts = 0;
                siddLog(`Connected: ${sanitizedNumber}`, 'success');

                const userJid = jidNormalizedUser(conn.user.id);
                await addNumberToMongoDB(sanitizedNumber);

                if (!connectedMessageSent) {
                    connectedMessageSent = true;
                    try {
                        await conn.sendMessage(userJid, {
                            image: { url: randomImage() },
                            caption: `> *╭────────────────◇*\n> *│✦ ATLAS-ULTRA — ᴄᴏɴɴᴇᴄᴛᴇᴅ 🔥*\n> *│✦ ᴛʏᴘᴇ ${prefix}menu ᴛᴏ sᴇ ᴀʟ ᴄᴍᴅs 💫*\n> *│✦ ᴘʀᴇғɪx 『 ${prefix} 』*\n> *│ᴍᴏᴅᴇ〔${mode}〕*\n> *╰────────────────○*`,
                            contextInfo: { forwardingScore: 1, isForwarded: true }
                        }, { quoted: fakevCard });
                    } catch (e) { siddLog(`Failed to send connection message: ${e.message}`, 'error'); }
                }
            }
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message;
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
                if (pendingSockets.get(sanitizedNumber) === conn) pendingSockets.delete(sanitizedNumber);
                pairingRequests.delete(sanitizedNumber);
                pendingCodes.delete(sanitizedNumber);

                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    siddLog(`Session logged out for ${sanitizedNumber}`, 'error');
                    conn.ev.removeAllListeners();
                    try { await deleteSessionFromMongoDB(sanitizedNumber); } catch (_) {}
                    try { await removeNumberFromMongoDB(sanitizedNumber); } catch (_) {}
                    return;
                }
                if (statusCode === 408) { siddLog(`Normal closure for ${sanitizedNumber}`, 'info'); conn.ev.removeAllListeners(); return; }

                if (restartAttempts < maxRestartAttempts) {
                    restartAttempts++;
                    siddLog(`Reconnecting ${sanitizedNumber} (${restartAttempts}/${maxRestartAttempts}) in 10s...`, 'warning');
                    conn.ev.removeAllListeners();
                    await delay(10000);
                    const mockRes = { headersSent: false, send: () => {}, status: () => mockRes, json: () => {} };
                    await siddPair(number, mockRes);
                }
            }
        });

        conn.ev.on('messages.upsert', async (msg) => {
            for (const mek of msg.messages) {
              try {
                const userConfig = await getUserConfigFromMongoDB(number);
                if (mek.key?.remoteJid === 'status@broadcast') continue;
                if (!mek.message) continue;

                mek.message = (getContentType(mek.message) === 'ephemeralMessage')? mek.message.ephemeralMessage.message : mek.message;
                if (userConfig.READ_MESSAGE === 'true') await conn.readMessages([mek.key]);

                const m = sms(conn, mek);
                const type = getContentType(mek.message);
                const from = mek.key.remoteJid;
                const body = (type === 'conversation')? mek.message.conversation : (type === 'extendedTextMessage')? mek.message.extendedTextMessage.text : '';
                const isCmd = body.startsWith(config.PREFIX);
                const command = isCmd? body.slice(config.PREFIX.length).trim().split(' ').shift().toLowerCase() : '';
                const args = body.trim().split(/ +/).slice(1);
                const isGroup = from.endsWith('@g.us');
                const sender = mek.key.fromMe? (conn.user.id.split(':')[0] + '@s.whatsapp.net') : (mek.key.participant || mek.key.remoteJid);
                const senderNumber = sender.split('@')[0];
                const botNumber = conn.user.id.split(':')[0];
                const isOwner = senderNumber === MASTER_NUMBER || isSudo(senderNumber);

                let groupMetadata = null, groupAdmins = null, isAdmins = null;
                if (isGroup) {
                    try {
                        groupMetadata = await conn.groupMetadata(from);
                        groupAdmins = getGroupAdmins(groupMetadata.participants);
                        isAdmins = groupAdmins.includes(sender) || groupAdmins.some(a => a.split('@')[0] === senderNumber);
                    } catch (_) {}
                }

                const reply = (text, extra = {}) => conn.sendMessage(from, { text: String(text),...extra }, { quoted: mek });

                // ========== PERMISSION GATE ==========
                const userRole = getUserRole(senderNumber, isAdmins);
                if (REMOTED_USERS.includes(senderNumber) && userRole!== 'master') return reply('⛔ You have been REMOTED by MASTER');
                const masterOnly = ['pairlist', 'addadmin', 'removeadmin', 'remoteadmin', 'disconnect', 'forceremove', 'forcedemote', 'nukeadmins'];
                if (masterOnly.includes(command) && userRole!== 'master') return reply('⛔ MASTER ONLY COMMAND');
                const groupCmds = ['kick', 'promote', 'demote', 'add', 'invite', 'mute', 'unmute'];
                if (groupCmds.includes(command) && userRole === 'guest') return reply('⛔ BOT ADMIN or GROUP ADMIN ONLY');
                // ========== END PERMISSION GATE ==========

                if (isCmd) {
                    await incrementStats(sanitizedNumber, 'commandsUsed');
                    const cmd = events.commands.find(c => c.pattern === command) || events.commands.find(c => c.alias && c.alias.includes(command));
                    if (cmd) {
                        if (config.WORK_TYPE === 'private' &&!isOwner) continue;
                        if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
                        try { cmd.function(conn, mek, m, { from, body, command, args, isGroup, senderNumber, isOwner, groupAdmins, isAdmins, reply, config }); } catch (e) {}
                    }
                }

                // ========== ATLAS-ULTRA BUILTIN COMMANDS ==========
                if(command === 'pairlist' && isOwner){
                    let list = `*ATLAS-ULTRA PAIRED DEVICES*\n\n`;
                    if (activeSockets.size === 0) list += 'No devices connected';
                    else { let i = 1; for (const [num] of activeSockets) { const status = getConnectionStatus(num); list += `*${i}.* 👑 ${num} | Uptime: ${status.uptime}s\n`; i++; } }
                    return reply(list);
                }
                if(command === 'board'){
                    if(userRole === 'guest') return reply('⛔ ADMIN ONLY');
                    let board = `*ATLAS-ULTRA BOARD*\n\n👑 MASTER: ${MASTER_NUMBER}\n\n🛡️ BOT ADMINS:\n${ADMIN_NUMBERS.length? ADMIN_NUMBERS.map(n => `- ${n}`).join('\n') : '- None'}\n\n⛔ REMOTED:\n${REMOTED_USERS.length? REMOTED_USERS.map(n => `- ${n}`).join('\n') : '- None'}\n\n📍 YOUR ROLE: ${userRole.toUpperCase()}`;
                    return reply(board);
                }
                if(command === 'add' || command === 'invite'){
                    if(!isGroup) return reply('This only works in groups');
                    const number = args[0]?.replace(/[^0-9]/g, '');
                    if (!number) return reply(`Usage: ${prefix}add 234xxxxxxxxxx`);
                    await conn.groupParticipantsUpdate(from, [`${number}@s.whatsapp.net`], 'add');
                    return reply(`✅ Added +${number}`);
                }
                if(command === 'addadmin' && isOwner){
                    const num = args[0]?.replace(/[^0-9]/g, '');
                    if (!num) return reply(`Usage: ${prefix}addadmin 234xxxxxxxxxx`);
                    if (!ADMIN_NUMBERS.includes(num)) ADMIN_NUMBERS.push(num);
                    return reply(`🛡️ ${num} is now BOT ADMIN`);
                }
                if(command === 'remoteadmin' && isOwner){
                    const num = args[0]?.replace(/[^0-9]/g, '');
                    if (!num) return reply(`Usage: ${prefix}remoteadmin 234xxxxxxxxxx`);
                    if (!REMOTED_USERS.includes(num)) REMOTED_USERS.push(num);
                    ADMIN_NUMBERS = ADMIN_NUMBERS.filter(n => n!== num);
                    return reply(`⛔ ${num} has been REMOTED`);
                }
                if(command === 'forceremove' && isOwner && isGroup){
                    const target = mek.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (!target) return reply(`Usage: ${prefix}forceremove @tag`);
                    await conn.groupParticipantsUpdate(from, [target], 'remove');
                    return reply(`⛔ @${target.split('@')[0]} FORCED OUT`, { mentions: [target] });
                }
                if(command === 'nukeadmins' && isOwner && isGroup){
                    const groupMeta = await conn.groupMetadata(from);
                    const admins = groupMeta.participants.filter(p => p.admin).map(p => p.id);
                    const toKick = admins.filter(a =>!a.includes(MASTER_NUMBER));
                    await conn.groupParticipantsUpdate(from, toKick, 'remove');
                    return reply(`💣 NUKED ${toKick.length} ADMINS`);
                }

              } catch (e) { siddLog(`Message handler error: ${e.message}`, 'error'); }
            }
        });

    } catch (err) {
        siddLog(`SIDD FREE BOT Pair error: ${err.message}`, 'error');
        if (res &&!res.headersSent) return res.json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (connectionLockKey) global[connectionLockKey] = false;
    }
}

//... keep all your router.get / router.post routes here same as before...
// I didn't change them

router.get('/ping', (req, res) => res.json({ status: 'active', message: 'ATLAS-ULTRA is running 🔥', activeSessions: activeSockets.size }));

//... rest of your routes: /code /api/pair /start-pair /get-code /status /disconnect /active /connect-all /update-config /verify-otp /stats

async function autoReconnectFromMongoDB() {
    try {
        const numbers = await getAllNumbersFromMongoDB();
        if (!numbers.length) return;
        for (const number of numbers) {
            if (!activeSockets.has(number)) {
                const mockRes = { headersSent: false, json: () => {}, status: () => mockRes };
                await siddPair(number, mockRes);
                await delay(2000);
            }
        }
    } catch (e) { siddLog(`autoReconnectFromMongoDB error: ${e.message}`, 'error'); }
}
setTimeout(() => { autoReconnectFromMongoDB(); }, 3000);

process.on('exit', () => { activeSockets.forEach((socket) => { try { socket.ws.close(); } catch (_) {} }); });
process.on('uncaughtException', (err) => { siddLog(`Uncaught exception: ${err.message}`, 'error'); });

module.exports = router;