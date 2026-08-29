const { cmd, getCommands } = require("../sidd.js");
const config = require("../config.js");

const ICONS = {
    ping: "🏓",
    alive: "🟢",
    menu: "📖"
};

cmd({
    pattern: "menu",
    alias: ["help"],
    desc: "Show all available commands",
    category: "main"
}, async (m, sock) => {
    const commands = getCommands();

    let list = "";
    for (const c of commands) {
        const icon = ICONS[c.pattern] || "▪️";
        list += `│ ${icon} ${config.PREFIX}${c.pattern}\n`;
    }

    const text =
        `╭┄┄〔 ${config.BOT_NAME} 〕\n` +
        `│\n` +
        list +
        `│\n` +
        `╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄▷\n\n` +
        `${config.FOOTER}`;

    await sock.sendMessage(m.from, { text }, { quoted: m.raw });
});
