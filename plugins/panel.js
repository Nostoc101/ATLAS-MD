const { cmd } = require('../sidd');
const { siddTechx } = require('../lib/style');
const { getAllNumbersFromMongoDB } = require('../lib/database');
const os = require('os');
const { runtime } = require('../lib/functions');

// SYNC FROM main.js
const MASTER_NUMBER = global.MASTER_NUMBER || '2348142334779';
const ADMIN_NUMBERS = global.ADMIN_NUMBERS || [];

cmd({
    pattern: "panel",
    alias: ['board2', 'dashboard'],
    desc: "Show ATLAS-ULTRA control panel - MASTER ONLY",
    category: "owner",
    react: "👑",
    filename: __filename
},
async (conn, mek, m, { from, senderNumber, reply }) => {
    try {
        if (senderNumber!== MASTER_NUMBER) return reply(siddTechx('PANEL', '⛔ MASTER ONLY COMMAND', '❌'));

        const uptime = runtime(process.uptime());
        const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const cpu = os.cpus().length;
        
        const allGroups = await conn.groupFetchAllParticipating();
        const groupCount = Object.keys(allGroups).length;

        const connectedNumbers = await getAllNumbersFromMongoDB();

        let panel = siddTechx('ATLAS-ULTRA PANEL', [
            `👑 MASTER: ${MASTER_NUMBER}`,
            `🛡️ BOT ADMINS: ${ADMIN_NUMBERS.length}`,
            `👥 CONNECTED BOTS: ${connectedNumbers.length}`,
            `👥 GROUPS: ${groupCount}`,
            `⚡ UPTIME: ${uptime}`,
            `💾 RAM: ${ram}MB / ${totalRam}GB`,
            `🧠 CPU CORES: ${cpu}`,
            `📢 BROADCAST: .broadcast <text>`,
            `🛡️ ADD ADMIN: .addadmin <number>`,
            `⛔ REMOTE: .remoteadmin <number>`,
            `🔗 ANTILINK: .antilink on/off`
        ].join('\n'), '📊');

        panel += `\n\n*QUICK BUTTONS:*`;

        await conn.sendMessage(from, {
            text: panel,
            footer: 'ATLAS-ULTRA V3 MASTER PANEL',
            buttons: [
                { buttonId: '.board', buttonText: { displayText: '👑 BOARD' }, type: 1 },
                { buttonId: '.pairlist', buttonText: { displayText: '📱 PAIRED' }, type: 1 },
                { buttonId: '.stats', buttonText: { displayText: '📊 STATS' }, type: 1 }
            ],
            headerType: 1
        }, { quoted: mek });

    } catch (e) {
        console.error('Panel cmd error:', e);
        reply(siddTechx('PANEL', 'Error loading panel', '❌'));
    }
});