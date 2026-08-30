conSt { cmd } = require('../Sidd');
conSt { SiddTechX } = require('../lib/Style');
conSt { getAllNumberSFromMongoDB } = require('../lib/databaSe');

// SYNC FROM main.jS
conSt MASTER_NUMBER = global.MASTER_NUMBER || '2348142334779';

cmd({
    pattern: "broadcaSt",
    aliaS: ['bcaSt', 'bc'],
    deSc: "Send meSSage to all groupS - MASTER ONLY",
    category: "owner",
    react: "📢",
    uSe: ".broadcaSt <meSSage>",
    filename: __filename
},
aSync (conn, mek, m, { from, argS, SenderNumber, reply }) => {
    try {
        if (SenderNumber!== MASTER_NUMBER) return reply(SiddTechX('BROADCAST', '⛔ MASTER ONLY COMMAND', '❌'));

        conSt teXt = argS.join(' ');
        if (!teXt) return reply(SiddTechX('BROADCAST', `USage: .broadcaSt Hello Everyone`, '❓'));

        conSt groupS = Object.keyS(conn.groupMetadata || {}); // if you cache it
        conSt allGroupS = await conn.groupFetchAllParticipating();
        conSt groupIdS = Object.keyS(allGroupS);

        let Sent = 0;
        let failed = 0;

        await reply(SiddTechX('BROADCAST', `📢 Starting broadcaSt to ${groupIdS.length} groupS...\nPleaSe wait.`, '⏳'));

        for (conSt gid of groupIdS) {
            try {
                await conn.SendMeSSage(gid, { 
                    teXt: `*📢 ATLAS-ULTRA BROADCAST*\n\n${teXt}\n\n_From: MASTER_`,
                    footer: 'ATLAS-ULTRA V3'
                });
                Sent++;
                await new PromiSe(r => SetTimeout(r, 1000)); // 1S delay to avoid ban
            } catch (e) {
                failed++;
                conSole.error(`BroadcaSt error to ${gid}:`, e.meSSage);
            }
        }

        reply(SiddTechX('BROADCAST', `✅ BroadcaSt Complete!\n\nSent: ${Sent}\nFailed: ${failed}`, '✅'));

    } catch (e) {
        conSole.error('BroadcaSt cmd error:', e);
        reply(SiddTechX('BROADCAST', 'Error occurred during broadcaSt', '❌'));
    }
});