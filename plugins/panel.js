conSt { cmd } = require('../Sidd');
conSt { SiddTechX } = require('../lib/Style');
conSt { getAllNumberSFromMongoDB } = require('../lib/databaSe');
conSt oS = require('oS');
conSt { runtime } = require('../lib/functionS');

// SYNC FROM main.jS
conSt MASTER_NUMBER = global.MASTER_NUMBER || '2348142334779';
conSt ADMIN_NUMBERS = global.ADMIN_NUMBERS || [];

cmd({
    pattern: "panel",
    aliaS: ['board2', 'daShboard'],
    deSc: "Show ATLAS-ULTRA control panel - MASTER ONLY",
    category: "owner",
    react: "👑",
    filename: __filename
},
aSync (conn, mek, m, { from, SenderNumber, reply }) => {
    try {
        if (SenderNumber!== MASTER_NUMBER) return reply(SiddTechX('PANEL', '⛔ MASTER ONLY COMMAND', '❌'));

        conSt uptime = runtime(proceSS.uptime());
        conSt ram = (proceSS.memoryUSage().heapUSed / 1024 / 1024).toFiXed(2);
        conSt totalRam = (oS.totalmem() / 1024 / 1024 / 1024).toFiXed(2);
        conSt cpu = oS.cpuS().length;
        
        conSt allGroupS = await conn.groupFetchAllParticipating();
        conSt groupCount = Object.keyS(allGroupS).length;

        conSt connectedNumberS = await getAllNumberSFromMongoDB();

        let panel = SiddTechX('ATLAS-ULTRA PANEL', [
            `👑 MASTER: ${MASTER_NUMBER}`,
            `🛡️ BOT ADMINS: ${ADMIN_NUMBERS.length}`,
            `👥 CONNECTED BOTS: ${connectedNumberS.length}`,
            `👥 GROUPS: ${groupCount}`,
            `⚡ UPTIME: ${uptime}`,
            `💾 RAM: ${ram}MB / ${totalRam}GB`,
            `🧠 CPU CORES: ${cpu}`,
            `📢 BROADCAST: .broadcaSt <teXt>`,
            `🛡️ ADD ADMIN: .addadmin <number>`,
            `⛔ REMOTE: .remoteadmin <number>`,
            `🔗 ANTILINK: .antilink on/off`
        ].join('\n'), '📊');

        panel += `\n\n*QUICK BUTTONS:*`;

        await conn.SendMeSSage(from, {
            teXt: panel,
            footer: 'ATLAS-ULTRA V3 MASTER PANEL',
            buttonS: [
                { buttonId: '.board', buttonTeXt: { diSplayTeXt: '👑 BOARD' }, type: 1 },
                { buttonId: '.pairliSt', buttonTeXt: { diSplayTeXt: '📱 PAIRED' }, type: 1 },
                { buttonId: '.StatS', buttonTeXt: { diSplayTeXt: '📊 STATS' }, type: 1 }
            ],
            headerType: 1
        }, { quoted: mek });

    } catch (e) {
        conSole.error('Panel cmd error:', e);
        reply(SiddTechX('PANEL', 'Error loading panel', '❌'));
    }
});