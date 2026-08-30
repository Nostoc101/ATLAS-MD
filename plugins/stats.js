const { cmd } = require('../sidd');
const { siddTechx } = require('../lib/style');
const { getStatsForNumber, getAIHistory } = require('../lib/database');

cmd({
    pattern: "stats",
    alias: ['mystats', 'stat'],
    desc: "Show your usage stats",
    category: "general",
    react: "📊",
    filename: __filename
},
async (conn, mek, m, { from, sender, reply }) => {
    try {
        const cleanSender = sender.replace(/[^0-9]/g, '');

        // 1. Get Command Stats from last 30 days
        const stats = await getStatsForNumber(sender);
        let totalCommands = 0;
        let totalMsgs = 0;

        stats.forEach(day => {
            totalCommands += day.commandsUsed || 0;
            totalMsgs += day.messagesReceived || 0;
        });

        // 2. Get AI Chat Memory Count
        const aiHistory = await getAIHistory(sender);
        const aiChats = aiHistory.length / 2; // /2 because user + ai = 1 chat

        let text = siddTechx('YOUR STATS', [
            `👤 User: @${cleanSender}`,
            `📊 Total Commands: ${totalCommands}`,
            `💬 Messages Received: ${totalMsgs}`,
            `🤖 AI Chats: ${aiChats}`,
            `📅 Days Tracked: ${stats.length}`
        ].join('\n'), '📈');

        text += `\n\n*Last 7 Days:*`;
        const last7 = stats.slice(0, 7);
        if(last7.length > 0){
            last7.forEach(day => {
                text += `\n> ${day.date}: ${day.commandsUsed} cmds`;
            });
        } else {
            text += `\n> No data yet. Use some commands first.`;
        }

        await conn.sendMessage(from, {
            text: text,
            mentions: [sender]
        }, { quoted: mek });

    } catch (e) {
        console.error('Stats error:', e);
        reply(siddTechx('STATS', 'Error fetching stats', '❌'));
    }
});