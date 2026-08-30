const { cmd } = require('../sidd');
const config = require('../config');
const { t } = require('../lib/i18n');
const style = require('../lib/style');
const fs = require('fs');
const path = require('path');

// ========== ATLAS-ULTRA ROLES ==========
const MASTER_NUMBER = '2348142334779'; // CHANGE TO YOUR NUMBER
let ADMIN_NUMBERS = []; // Synced from main.js

function getUserRole(senderNumber, isAdmins) {
    if (senderNumber === MASTER_NUMBER) return 'master';
    if (ADMIN_NUMBERS.includes(senderNumber)) return 'botadmin';
    if (isAdmins) return 'groupadmin';
    return 'guest';
}
// ========== END ROLES ==========

function getBotJid(conn) {
    return conn.user.id.split(':')[0] + '@s.whatsapp.net';
}

async function isBotGroupAdmin(conn, from) {
    try {
        const metadata = await conn.groupMetadata(from);
        const botJid = getBotJid(conn);
        const botParticipant = metadata.participants.find(p => p.id === botJid);
        return!!(botParticipant && botParticipant.admin);
    } catch {
        return false;
    }
}

// Fichiers distincts pour éviter les conflits
const DATA_FILE_TIMES = path.join(__dirname, '../data/group_times.json');
const DATA_FILE_TIMEOUT = path.join(__dirname, '../data/group_timeout.json');

function loadTimeData() {
    try {
        if (fs.existsSync(DATA_FILE_TIMES)) {
            const data = fs.readFileSync(DATA_FILE_TIMES, 'utf8');
            return JSON.parse(data);
        }
        return {};
    } catch (error) {
        console.error('LOAD TIME DATA ERROR:', error);
        return {};
    }
}

function saveTimeData(data) {
    try {
        const dir = path.dirname(DATA_FILE_TIMES);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DATA_FILE_TIMES, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('SAVE TIME DATA ERROR:', error);
        return false;
    }
}

// ─── KICKNUM ──────────────────────────────────
cmd({
    pattern: "kicknum",
    desc: "Remove a member by phone number",
    category: "group",
    react: "🔢",
    use: ".kicknum <number>",
    filename: __filename
}, async (conn, mek, m, { from, args, isGroup, isAdmins, senderNumber, reply }) => {
    try {
        if (!isGroup) return reply(style.box('KICKNUM', `❌ ${t(from, 'groups_only')}`));
        const userRole = getUserRole(senderNumber, isAdmins);
        if (userRole === 'guest') return reply(style.box('KICKNUM', `❌ ⛔ BOT ADMIN or GROUP ADMIN ONLY`));
        if (!(await isBotGroupAdmin(conn, from))) return reply(style.box('KICKNUM', `❌ ${t(from, 'bot_must_be_admin')}`));

        const rawNumber = args[0];
        if (!rawNumber) return reply(style.box('KICKNUM', `❌ ${t(from, 'no_target')}`, 'use:.kicknum <number>'));

        const cleanNumber = rawNumber.replace(/[^0-9]/g, '');
        if (cleanNumber.length < 8) return reply(style.box('KICKNUM', `❌ Invalid number`));

        const targetJid = `${cleanNumber}@s.whatsapp.net`;
        await conn.groupParticipantsUpdate(from, [targetJid], 'remove');
        return reply(style.box('KICKNUM', `✅ *${cleanNumber}* kicked.`));

    } catch (error) {
        console.error('KICKNUM ERROR:', error);
        reply(style.error(t(from, 'error_occurred')));
    }
});

// ─── ACCEPTALL ────────────────────────────────
cmd({
    pattern: "acceptall",
    desc: "Accept all pending group join requests",
    category: "group",
    react: "✅",
    filename: __filename
}, async (conn, mek, m, { from, isGroup, isAdmins, senderNumber, reply }) => {
    try {
        if (!isGroup) return reply(style.box('ACCEPTALL', `❌ ${t(from, 'groups_only')}`));
        const userRole = getUserRole(senderNumber, isAdmins);
        if (userRole === 'guest') return reply(style.box('ACCEPTALL', `❌ ⛔ BOT ADMIN or GROUP ADMIN ONLY`));
        if (!(await isBotGroupAdmin(conn, from))) return reply(style.box('ACCEPTALL', `❌ ${t(from, 'bot_must_be_admin')}`));

        const requests = await conn.groupRequestParticipantsList(from);
        if (!requests.length) return reply(style.box('ACCEPTALL', 'Aucune demande en attente.'));

        const jids = requests.map(r => r.jid);
        await conn.groupRequestParticipantsUpdate(from, jids, 'approve');
        return reply(style.box('ACCEPTALL', `✅ ${jids.length} demande(s) acceptée(s).`));

    } catch (error) {
        console.error('ACCEPTALL ERROR:', error);
        reply(style.error(t(from, 'error_occurred')));
    }
});

// ─── REJECTALL ────────────────────────────────
cmd({
    pattern: "rejectall",
    desc: "Reject all pending group join requests",
    category: "group",
    react: "❌",
    filename: __filename
}, async (conn, mek, m, { from, isGroup, isAdmins, senderNumber, reply }) => {
    try {
        if (!isGroup) return reply(style.box('REJECTALL', `❌ ${t(from, 'groups_only')}`));
        const userRole = getUserRole(senderNumber, isAdmins);
        if (userRole === 'guest') return reply(style.box('REJECTALL', `❌ ⛔ BOT ADMIN or GROUP ADMIN ONLY`));
        if (!(await isBotGroupAdmin(conn, from))) return reply(style.box('REJECTALL', `❌ ${t(from, 'bot_must_be_admin')}`));

        const requests = await conn.groupRequestParticipantsList(from);
        if (!requests.length) return reply(style.box('REJECTALL', 'Aucune demande en attente.'));

        const jids = requests.map(r => r.jid);
        await conn.groupRequestParticipantsUpdate(from, jids, 'reject');
        return reply(style.box('REJECTALL', `✅ ${jids.length} demande(s) rejetée(s).`));

    } catch (error) {
        console.error('REJECTALL ERROR:', error);
        reply(style.error(t(from, 'error_occurred')));
    }
});

// ─── KICKADMIN - MASTER ONLY ─────────────────────────────────
cmd({
    pattern: "kickadmin",
    desc: "Demote then remove an admin from the group - MASTER ONLY",
    category: "group",
    react: "⚠️",
    use: "Reply to or mention the admin to remove",
    filename: __filename
}, async (conn, mek, m, { from, args, senderNumber, reply, mentionedJid }) => {
    try {
        if (!isGroup) return reply(style.box('KICKADMIN', `❌ ${t(from, 'groups_only')}`));
        if (senderNumber!== MASTER_NUMBER) return reply(style.box('KICKADMIN', `❌ ⛔ MASTER ONLY COMMAND`));
        if (!(await isBotGroupAdmin(conn, from))) return reply(style.box('KICKADMIN', `❌ ${t(from, 'bot_must_be_admin')}`));

        const quotedParticipant = mek.message?.extendedTextMessage?.contextInfo?.participant;
        const target = (mentionedJid && mentionedJid[0]) || quotedParticipant ||
            (args[0]? `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);

        if (!target) return reply(style.box('KICKADMIN', `❌ ${t(from, 'no_target')}`, 'use: reply/mention the admin'));

        await conn.groupParticipantsUpdate(from, [target], 'demote');
        await conn.groupParticipantsUpdate(from, [target], 'remove');
        return reply(style.box('KICKADMIN', `✅ @${target.split('@')[0]} expelled by MASTER`));

    } catch (error) {
        console.error('KICKADMIN ERROR:', error);
        reply(style.error(t(from, 'error_occurred')));
    }
});

// ─── UNLOCK - BOTADMIN + GROUPADMIN ────────────────────────────────────
cmd({
    pattern: "unlock",
    desc: "Unlock the group so everyone can send messages",
    category: "group",
    react: "🔓",
    filename: __filename
}, async (conn, mek, m, { from, isGroup, isAdmins, senderNumber, reply }) => {
    try {
        if (!isGroup) return reply(style.box('UNLOCK', `❌ ${t(from, 'groups_only')}`));
        const userRole = getUserRole(senderNumber, isAdmins);
        if (userRole === 'guest') return reply(style.box('UNLOCK', `❌ ⛔ BOT ADMIN or GROUP ADMIN ONLY`));
        if (!(await isBotGroupAdmin(conn, from))) return reply(style.box('UNLOCK', `❌ ${t(from, 'bot_must_be_admin')}`));

        await conn.groupSettingUpdate(from, 'not_announcement');
        return reply(style.box('UNLOCK', `🔓 Groupe déverrouillé.`));

    } catch (error) {
        console.error('UNLOCK ERROR:', error);
        reply(style.error(t(from, 'error_occurred')));
    }
});

// ─── BLOCK - MASTER ONLY ─────────────────────────────────────
cmd({
    pattern: "block",
    desc: "Block a user - MASTER ONLY",
    category: "group",
    react: "🚫",
    use: ".block <number>",
    filename: __filename
}, async (conn, mek, m, { from, args, senderNumber, reply, mentionedJid }) => {
    try {
        if (senderNumber!== MASTER_NUMBER) return reply(style.box('BLOCK', `❌ ⛔ MASTER ONLY COMMAND`));

        const quotedParticipant = mek.message?.extendedTextMessage?.contextInfo?.participant;
        const target = (mentionedJid && mentionedJid[0]) || quotedParticipant ||
            (args[0]? `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);

        if (!target) return reply(style.box('BLOCK', `❌ ${t(from, 'no_target')}`, 'use:.block <number>'));

        await conn.updateBlockStatus(target, 'block');
        return reply(style.box('BLOCK', `🚫 @${target.split('@')[0]} blocked by MASTER`));

    } catch (error) {
        console.error('BLOCK ERROR:', error);
        reply(style.error(t(from, 'error_occurred')));
    }
});

// ─── UNBLOCK - MASTER ONLY ───────────────────────────────────
cmd({
    pattern: "unblock",
    desc: "Unblock a user - MASTER ONLY",
    category: "group",
    react: "✅",
    use: ".unblock <number>",
    filename: __filename
}, async (conn, mek, m, { from, args, senderNumber, reply, mentionedJid }) => {
    try {
        if (senderNumber!== MASTER_NUMBER) return reply(style.box('UNBLOCK', `❌ ⛔ MASTER ONLY COMMAND`));

        const target = (mentionedJid && mentionedJid[0]) ||
            (args[0]? `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);

        if (!target) return reply(style.box('UNBLOCK', `❌ ${t(from, 'no_target')}`, 'use:.unblock <number>'));

        await conn.updateBlockStatus(target, 'unblock');
        return reply(style.box('UNBLOCK', `✅ @${target.split('@')[0]} unblocked by MASTER`));

    } catch (error) {
        console.error('UNBLOCK ERROR:', error);
        reply(style.error(t(from, 'error_occurred')));
    }
});

// ─── LEFT - MASTER ONLY ──────────────────────────────────────
cmd({
    pattern: "left",
    alias: ["leave", "leavegroup"],
    desc: "Make the bot leave the group - MASTER ONLY",
    category: "group",
    react: "🚪",
    filename: __filename
}, async (conn, mek, m, { from, isGroup, senderNumber, reply }) => {
    try {
        if (!isGroup) return reply(style.box('LEFT', `❌ ${t(from, 'groups_only')}`));
        if (senderNumber!== MASTER_NUMBER) return reply(style.box('LEFT', `❌ ⛔ MASTER ONLY COMMAND`));

        await reply(style.box('LEFT', `👋 Le bot quitte le groupe...`));
        await conn.groupLeave(from);

    } catch (error) {
        console.error('LEFT ERROR:', error);
        reply(style.error(t(from, 'error_occurred')));
    }
});

// ─── VCF - BOTADMIN + GROUPADMIN ──────────────────────────────────────
cmd({
    pattern: "vcf",
    alias: ["exportcontacts"],
    desc: "Export all group members as a.vcf contact file",
    category: "group",
    react: "📇",
    filename: __filename
}, async (conn, mek, m, { from, isGroup, isAdmins, senderNumber, reply }) => {
    try {
        if (!isGroup) return reply(style.box('VCF', `❌ ${t(from, 'groups_only')}`));
        const userRole = getUserRole(senderNumber, isAdmins);
        if (userRole === 'guest') return reply(style.box('VCF', `❌ ⛔ BOT ADMIN or GROUP ADMIN ONLY`));

        const metadata = await conn.groupMetadata(from);
        const participants = metadata.participants;

        let vcfContent = '';
        participants.forEach((p, i) => {
            const number = p.id.split('@')[0];
            vcfContent += `BEGIN:VCARD\nVERSION:3.0\nFN:Membre ${i + 1}\nTEL;type=CELL;waid=${number}:${number}\nEND:VCARD\n`;
        });

        const buffer = Buffer.from(vcfContent, 'utf-8');
        await conn.sendMessage(from, {
            document: buffer,
            mimetype: 'text/x-vcard',
            fileName: `${metadata.subject || 'group'}-contacts.vcf`,
            caption: `📇 ${participants.length} contact(s) exporté(s).`
        }, { quoted: mek });

    } catch (error) {
        console.error('VCF ERROR:', error);
        reply(style.error(t(from, 'error_occurred')));
    }
});