const { cmd } = require('../sidd');
const { t } = require('../lib/i18n');
const style = require('../lib/style');

// ATLAS-ULTRA ROLES - SYNCED FROM main.js GLOBALLY
const MASTER_NUMBER = global.MASTER_NUMBER || '2348142334779'; // CHANGE TO YOUR NUMBER
const ADMIN_NUMBERS = global.ADMIN_NUMBERS || []; // This is synced from main.js

function getUserRole(senderNumber, isAdmins) {
    const num = senderNumber.replace(/[^0-9]/g, ''); // ADD THIS TO MATCH main.js
    if (num === MASTER_NUMBER) return 'master';
    if (ADMIN_NUMBERS.includes(num)) return 'botadmin'; // CHECK CLEAN NUMBER
    if (isAdmins) return 'groupadmin';
    return 'guest';
}

cmd({
    pattern: "ginfo",
    desc: "Display group information",
    category: "group",
    filename: __filename,
},
async (conn, mek, m, { from, isGroup, isAdmins, senderNumber, isBotAdmins, reply }) => {
    try {
        if (!isGroup) return reply(style.error(t(from, 'plugin_groups_only')));
        const userRole = getUserRole(senderNumber, isAdmins);
        if (userRole === 'guest') return reply(style.error('⛔ BOT ADMIN or GROUP ADMIN ONLY'));
        if (!isBotAdmins) return reply(style.error(t(from, 'bot_must_be_admin')));

        const groupMetadata = await conn.groupMetadata(from);
        const groupName = groupMetadata.subject;
        const memberCount = groupMetadata.participants.length;

        let creator = groupMetadata.owner? `@${groupMetadata.owner.split('@')[0]}` : 'UNKNOWN';

        const groupAdmins = groupMetadata.participants
          .filter(member => member.admin)
          .map((admin, index) => `${index + 1}. @${admin.id.split('@')[0]}`)
          .join("\n") || "NO ADMIN FOUND";

        const creationDate = groupMetadata.creation
          ? new Date(groupMetadata.creation * 1000).toLocaleString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            })
            : 'UNKNOWN';

        const message = style.box('ATLAS-ULTRA GROUP INFO', [
            `NAME: ${groupName}`,
            `ID: ${from}`,
            `TOTAL MEMBERS: ${memberCount}`,
            `CREATOR: ${creator}`,
            `CREATED: ${creationDate}`,
            `ADMINS:\n${groupAdmins}`
        ]);

        await conn.sendMessage(from, {
            text: message,
            mentions: groupMetadata.participants.filter(m2 => m2.admin).map(a => a.id)
        }, { quoted: mek });

    } catch (error) {
        console.error("GINFO ERROR:", error);
        reply(style.error(`${t(from, 'error_occurred')}.`));
    }
});

// ── kickall / stop ────────────────────────────────────────────────────
const stopFlags = new Map(); // groupJid -> boolean
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

cmd({
    pattern: "kickall",
    desc: "Continuously remove all non-admins until stopped",
    react: "🧨",
    category: "group",
    filename: __filename,
},
async (conn, mek, m, { from, isGroup, senderNumber, isAdmins, groupMetadata, groupAdmins, isBotAdmins, reply }) => {
    try {
        if (!isGroup) return reply(style.error(t(from, 'plugin_groups_only')));
        const userRole = getUserRole(senderNumber, isAdmins);
        if (userRole === 'guest') return reply(style.error('⛔ BOT ADMIN or GROUP ADMIN ONLY'));
        if (!isBotAdmins) return reply(style.error(t(from, 'bot_must_be_admin')));

        stopFlags.set(from, false);
        reply(style.warning('THE BOT WILL CONTINUOUSLY REMOVE ALL NON-ADMINS UNTIL THEY ARE GONE OR.stop IS USED.'));

        while (true) {
            const metadata = await conn.groupMetadata(from);
            const botJid = conn.user.id;
            const nonAdmins = metadata.participants.filter(mem =>!groupAdmins.includes(mem.id) && mem.id!== botJid);

            if (nonAdmins.length === 0) {
                reply(style.success('NO MORE NON-ADMIN TO REMOVE.'));
                break;
            }

            for (const participant of nonAdmins) {
                if (stopFlags.get(from)) {
                    reply(style.success('OPERATION STOPPED BY THE USER. SOME MEMBERS WERE NOT REMOVED.'));
                    stopFlags.delete(from);
                    return;
                }
                await conn.groupParticipantsUpdate(from, [participant.id], "remove")
                  .catch(err => console.error(`KICKALL REMOVE ERROR ${participant.id}:`, err));
                await delay(1000);
            }
        }
        stopFlags.delete(from);
    } catch (e) {
        console.error('KICKALL ERROR:', e);
        reply(style.error(`${t(from, 'error_occurred')}.`));
    }
});

cmd({
    pattern: "stop",
    desc: "Stop the ongoing kickall",
    react: "⏹️",
    category: "group",
    filename: __filename,
},
async (conn, mek, m, { from, senderNumber, isAdmins, reply }) => {
    const userRole = getUserRole(senderNumber, isAdmins);
    if (userRole === 'guest') return reply(style.error('⛔ BOT ADMIN or GROUP ADMIN ONLY'));
    stopFlags.set(from, true);
    reply(style.success('OPERATION STOPPED'));
});

// ── NEW: FORCEREMOVE - MASTER ONLY ──
cmd({
    pattern: "forceremove",
    alias: ['fr'],
    desc: "Master force kick anyone including admins",
    react: "💣",
    category: "group",
    filename: __filename,
},
async (conn, mek, m, { from, isGroup, senderNumber, reply }) => {
    if (!isGroup) return reply(style.error(t(from, 'plugin_groups_only')));
    const userRole = getUserRole(senderNumber); // USE getUserRole INSTEAD OF DIRECT CHECK
    if (userRole!== 'master') return reply(style.error('⛔ MASTER ONLY COMMAND'));

    const target = mek.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (!target) return reply(style.error(`Usage:.forceremove @tag`));

    try {
        await conn.groupParticipantsUpdate(from, [target], "remove");
        reply(`⛔ @${target.split('@')[0]} has been FORCED OUT by MASTER`, { mentions: [target] });
    } catch(e) {
        reply(style.error('Failed to remove. Bot might not be admin'));
    }
});

// ── NEW: NUKEADMINS - MASTER ONLY ──
cmd({
    pattern: "nukeadmins",
    desc: "Master kick all admins in group",
    react: "💥",
    category: "group",
    filename: __filename,
},
async (conn, mek, m, { from, isGroup, senderNumber, reply }) => {
    if (!isGroup) return reply(style.error(t(from, 'plugin_groups_only')));
    const userRole = getUserRole(senderNumber); // USE getUserRole INSTEAD OF DIRECT CHECK
    if (userRole!== 'master') return reply(style.error('⛔ MASTER ONLY COMMAND'));

    try {
        const groupMeta = await conn.groupMetadata(from);
        const admins = groupMeta.participants.filter(p => p.admin).map(p => p.id);
        const toKick = admins.filter(a =>!a.includes(MASTER_NUMBER));
        if(toKick.length === 0) return reply(style.warning('No admins to nuke'));

        await conn.groupParticipantsUpdate(from, toKick, "remove");
        reply(style.success(`💣 NUKED ${toKick.length} ADMINS FROM GROUP`));
    } catch(e) {
        reply(style.error('Failed to nuke admins'));
    }
});