const { cmd } = require('../sidd');
const { siddTechx } = require('../lib/style');

// SYNC FROM main.js
const MASTER_NUMBER = global.MASTER_NUMBER || '2348142334779';

cmd({
    pattern: "broadcast",
    alias: ['bcast', 'bc'],
    desc: "Send message to all groups - MASTER ONLY",
    category: "owner",
    react: "📢",
    use: ".broadcast <message>",
    filename: __filename
},
async (conn, mek, m, { from, args, senderNumber, reply }) => {
    try {
        if (senderNumber !== MASTER_NUMBER) return reply(
            siddTechx('BROADCAST', '⛔ MASTER ONLY COMMAND', '❌')
        );

        const text = args.join(' ');
        if (!text) return reply(
            siddTechx('BROADCAST', `Usage: .broadcast Hello Everyone`, '❓')
        );

        const allGroups = await conn.groupFetchAllParticipating();
        const groupIds = Object.keys(allGroups);

        let sent = 0;
        let failed = 0;

        await reply(
            siddTechx('BROADCAST', `📢 Starting broadcast to ${groupIds.length} groups...\nPlease wait.`, '⏳')
        );

        for (const gid of groupIds) {
            try {
                await conn.sendMessage(gid, { 
                    text: `*📢 ATLAS-ULTRA BROADCAST*\n\n${text}\n\n_From: MASTER_`,
                    footer: 'ATLAS-ULTRA V3'
                });
                sent++;
                await new Promise(r => setTimeout(r, 1000)); // 1s delay to avoid ban
            } catch (e) {
                failed++;
                console.error(`Broadcast error to ${gid}:`, e.message);
            }
        }

        reply(
            siddTechx('BROADCAST', `✅ Broadcast Complete!\n\nSent: ${sent}\nFailed: ${failed}`, '✅')
        );

    } catch (e) {
        console.error('Broadcast cmd error:', e);
        reply(
            siddTechx('BROADCAST', 'Error occurred during broadcast', '❌')
        );
    }
});