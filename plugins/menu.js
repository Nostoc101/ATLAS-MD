const { cmd, commands } = require('../sidd');
const config = require('../config');
const moment = require('moment-timezone');
const { randomImage } = require('../lib/images');
const { t } = require('../lib/i18n');
const os = require('os');
const { runtime } = require('../lib/functions');
const style = require('../lib/style');

// ========== ATLAS-ULTRA ROLES ==========
const MASTER_NUMBER = '2348142334779'; // CHANGE TO YOUR NUMBER
// ADMIN_NUMBERS will come from global set in main.js

function getUserRole(senderNumber, isAdmins) {
    const num = senderNumber.replace(/[^0-9]/g, '');
    if (num === MASTER_NUMBER) return 'master';
    if (global.ADMIN_NUMBERS && global.ADMIN_NUMBERS.includes(num)) return 'botadmin';
    if (isAdmins) return 'groupadmin';
    return 'guest';
}
// ========== END ROLES ==========

const CATEGORY_ICONS = {
  main: '🏠', info: 'ℹ️', download: '📥', group: '👥',
  owner: '👑', tools: '🛠️', settings: '⚙️', system: '⚡',
  media: '🎬', search: '🔎', general: '📦'
};

const CATEGORY_NAMES = {
  main: '𝙼𝙰𝙸𝙽', info: '𝙸𝙽𝙵𝙾', download: '𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳', group: '𝙶𝚁𝙾𝚄𝙿',
  owner: '𝙾𝚆𝙽𝙴𝚁', tools: '𝚃𝙾𝙾𝙻𝚂', settings: '𝚂𝙴𝚃𝙸𝙽𝙶𝚂', system: '𝚂𝚈𝚂𝚃𝙴𝙼',
  media: '𝙼𝙴𝙳𝙸𝙰', search: '𝚂𝙴𝙰𝚁𝙲𝙷', general: '𝙶𝙴𝙽𝙴𝚁𝙰𝙻'
};

const EXCLUDED_CATEGORIES = new Set([
  'android', 'ios', 'lottie', 'sticker', 'interactive', 'int',
  'invite', 'payment', 'pay', 'viewonce', 'vo', 'groupstatus',
  'gs', 'blank', 'mention', 'status', 'media', 'freeze',
  'all', 'super', 'bug'
]);

function listCommands() {
  return (Array.isArray(commands)? commands : [])
   .filter(c => c && c.pattern && c.dontAddCommandList!== true)
   .filter(c =>!EXCLUDED_CATEGORIES.has(String(c.category || '').trim().toLowerCase()))
   .map(c => ({
      pattern: String(c.pattern).trim(),
      category: String(c.category || 'misc').trim().toLowerCase(),
      desc: String(c.desc || '').trim()
    }))
   .filter(c => c.pattern);
}

function buildGroups() {
  const groups = new Map();
  for (const c of listCommands()) {
    const key = c.category || 'misc';
    if (!groups.has(key)) groups.set(key, new Map());
    const commandKey = c.pattern.toLowerCase();
    if (!groups.get(key).has(commandKey)) groups.get(key).set(commandKey, c);
  }
  return [...groups.entries()]
   .map(([category, map]) => [category, [...map.values()].sort((a, b) => a.pattern.localeCompare(b.pattern))])
   .sort((a, b) => a[0].localeCompare(b[0]));
}

function toMonospaceCaps(str) {
  const base = 0x1D670;
  return str.toUpperCase().replace(/[A-Z]/g, ch => String.fromCodePoint(base + ch.charCodeAt(0) - 65));
}

const SMALLCAP_MAP = {
  a:'ᴀ', b:'ʙ', c:'ᴄ', d:'ᴅ', e:'ᴇ', f:'ғ', g:'ɢ', h:'ʜ', i:'ɪ', j:'ᴊ',
  k:'ᴋ', l:'ʟ', m:'ᴍ', n:'ɴ', o:'ᴏ', p:'ᴘ', q:'ǫ', r:'ʀ', s:'s', t:'ᴛ',
  u:'ᴜ', v:'ᴠ', w:'ᴡ', x:'x', y:'ʏ', z:'ᴢ'
};

function smallcap(str) {
  return String(str).split('').map(ch => SMALLCAP_MAP[ch.toLowerCase()] || ch).join('');
}

function categoryTitle(category) {
  return CATEGORY_NAMES[category] || toMonospaceCaps(category.replace(/[-_]/g, ' '));
}

cmd({
  pattern: 'menu',
  alias: ['sidd', 'help', 'list'],
  react: '👑',
  desc: 'ATLAS-ULTRA Dynamic command menu',
  category: 'main',
  filename: __filename
}, async (conn, mek, m, { from, sender, isAdmins, pushName, reply }) => {
  const chat = from || m.chat;
  const senderNumber = sender.split('@')[0];
  const userRole = getUserRole(senderNumber, isAdmins);

  try {
    const groups = buildGroups();
    const total = groups.reduce((n, [, list]) => n + list.length, 0);
    const prefix = config.PREFIX || '.';
    const botName = 'ATLAS-ULTRA V3';
    const uptime = runtime(process.uptime());
    const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);

    const zone = 'Africa/Lagos';
    const now = moment().tz(zone);
    const image = config.MENU_IMAGE_URL || randomImage();

    // ROLE BADGE
    let roleBadge = '👤 USER';
    if (userRole === 'master') roleBadge = '👑 MASTER';
    if (userRole === 'botadmin') roleBadge = '🛡️ BOT ADMIN';
    if (userRole === 'groupadmin') roleBadge = '🛡️ GROUP ADMIN';

    let body = '';

    // Show all categories except owner for guests
    for (const [category, list] of groups) {
      if (category === 'owner' && userRole === 'guest') continue; // Hide owner cmds from guests

      const icon = CATEGORY_ICONS[category] || '📁';
      body += `\n*⥤ ${icon} \`${categoryTitle(category)}\`*\n*╭┄┄┄┄┄┄┈ᕗ*\n`;
      for (const c of list) {
        // Hide master-only cmds from non-masters
        if (category === 'owner' && userRole!== 'master') continue;
        body += `*│✦ ${prefix}${smallcap(c.pattern)}*\n`;
      }
      body += '*╰┄┄┄┄┄┈┈ᕗ*\n';
    }

    const caption = `*╭┄『 \`𝙰𝚃𝙻𝙰𝚂-𝚄𝙻𝚃𝚁𝙰 𝚅3\` 』*\n*│✦ 𝙿𝚁𝙴𝙵𝙸𝚇: 〔${prefix}〕*\n*│✦ 𝚄𝚂𝙴𝚁: ${pushName}*\n*│✦ 𝚁𝙾𝙻𝙴: ${roleBadge}*\n*│✦ 𝙲𝙾𝙼𝙼𝙰𝙽𝙳𝚂: ${total}*\n*│✦ 𝚄𝙿𝚃𝙸𝙼𝙴: ${uptime}*\n*│✦ 𝚁𝙰𝙼: ${ram}MB / ${totalRam}GB*\n*│✦ 𝚃𝙸𝙼𝙴: ${now.format('HH:mm:ss')}*\n*│✦ 𝙳𝙰𝚃𝙴: ${now.format('DD/MM/YYYY')}*\n*╰┄┄┄┄┄┄┄┄┄┄⪼*\n${body}\n> *ATLAS-ULTRA | MADE BY MASTER*`;

    await conn.sendMessage(chat, {
      image: { url: image },
      caption,
      footer: 'ATLAS-ULTRA V3',
      buttons: [
        { buttonId: `${prefix}ping`, buttonText: { displayText: '⚡ PING' }, type: 1 },
        { buttonId: `${prefix}alive`, buttonText: { displayText: '🤖 ALIVE' }, type: 1 },
        { buttonId: `${prefix}board`, buttonText: { displayText: '👑 BOARD' }, type: 1 }
      ],
      headerType: 1,
      viewOnce: true,
      contextInfo: {
        mentionedJid: [sender],
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363413253579833@newsletter',
          newsletterName: 'ATLAS-ULTRA',
          serverMessageId: 143
        }
      }
    }, { quoted: mek });

  } catch (error) {
    console.error('MENU ERROR:', error);
    await reply(style.error('Error loading ATLAS-ULTRA menu'));
  }
});