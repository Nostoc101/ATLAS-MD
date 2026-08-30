const { cmd } = require('../sidd');
const { siddTechx } = require('../lib/style');

const deletedMsgs = new Map(); // messageID -> messageData
const ADMIN_NUMBERS = global.ADMIN_NUMBERS || [];

function getUserRole(senderNumber, isAdmins) {
    const num = senderNumber.replace(/[^0-9]/g, '');
    if (ADMIN_NUMBERS.includes(num) || isAdmins) return true;
    return false;
}

// =========== SAVE MESSAGE BEFORE DELETE ===========
cmd({
    on: "message"
},
async (conn, mek) => {
    try {
        const msg = mek.message;
        if (!msg) return;
        const key = mek.key;
        // Save for 5 minutes
        deletedMsgs.set(key.id, {
            message: msg,
            sender: key.participant || key.remoteJid,
            chat: key.remoteJid,
            timestamp: Date.now()
        });
        // Auto delete cache after 5min
        setTimeout(() => deletedMsgs.delete(key.id), 300000);
    } catch (e) {}
});

// =========== DETECT DELETE ===========
conn.ev.on('messages.delete', async (del) => {
    try {
        for(const key of del.keys) {
            const saved = deletedMsgs.get(key.id);
            if(!saved) continue;

            const { message, sender, chat } = saved;
            let type = Object.keys(message)[0];
            let body = message[type]?.text || message[type]?.caption || '[Media]';

            await conn.sendMessage(chat, {
                text: `🗑️ *ANTI-DELETE*\n\n@${sender.split('@')[0]} deleted a message:\n\n"${body}"`,
                mentions: [sender]
            });
        }
    } catch (e) {
        console.error('Antidelete error:', e);
    }
});

// =========== TOGGLE COMMAND ===========
cmd({
    pattern: "antidelete",
    desc: "Toggle anti-delete",
    category: "group",
    react: "🗑️",
    use: ".antidelete on/off",
    filename: __filename
},
async (conn, mek, m, { from, args, isGroup, senderNumber, isAdmins, reply }) => {
    if (!isGroup) return reply(siddTechx('ANTIDELETE', 'Groups only', '❌'));
    if (!getUserRole(senderNumber, isAdmins)) return reply(siddTechx('ANTIDELETE', '⛔ ADMIN ONLY', '❌'));

    const action = args[0]?.toLowerCase();
    const key = `antidelete_${from}`;

    if(action === 'on') {
        await setSetting(key, true);
        reply(siddTechx('ANTIDELETE', '🟢 Anti-Delete ACTIVATED', '✅'));
    } else if(action === 'off') {
        await setSetting(key, false);
        reply(siddTechx('ANTIDELETE', '🔴 Anti-Delete DEACTIVATED', '❌'));
    } else {
        reply(siddTechx('ANTIDELETE', 'Usage:.antidelete on/off', '❓'));
    }
});