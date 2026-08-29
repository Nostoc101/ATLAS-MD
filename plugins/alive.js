const { cmd } = require("../sidd.js");
const config = require("../config.js");

cmd({
    pattern: "alive",
    alias: [],
    desc: "Check if the bot is online",
    category: "main"
}, async (m, sock) => {
    const text =
        `╭━━━〔 ${config.BOT_NAME} 〕\n` +
        `│\n` +
        `│ 🟢 Bot is Online\n` +
        `│\n` +
        `│ ⚡ Status: Active\n` +
        `│ 🤖 Version: ${config.VERSION}\n` +
        `│\n` +
        `╰━━━━━━━━━━━━━━━━━━━➤\n\n` +
        `${config.FOOTER}`;

    await sock.sendMessage(m.from, { text }, { quoted: m.raw });
});
