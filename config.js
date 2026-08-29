// ═══════════════════════════════════════════════════════════════════════════
//                    SIDD FREE BOT - CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const dotenv = require('dotenv');

if (fs.existsSync('.env')) {
    dotenv.config({ path: '.env' });
}

module.exports = {

    // ═══════════════════════════════════════════════════════════════════════
    //  🔐 SESSION & DATABASE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * MongoDB Atlas connection string — sessions are stored here.
     * ⚠️ RECOMMENDED: set your own MongoDB URI via the MONGODB_URI env variable.
     * The value below is only a default fallback.
     */
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://siddtechxofc:siddtechxofc@cluster0.2l6eikl.mongodb.net/?appName=Cluster0',

    // ═══════════════════════════════════════════════════════════════════════
    //  🤖 BOT IDENTITY
    // ═══════════════════════════════════════════════════════════════════════

    /** Command prefix */
    PREFIX: process.env.PREFIX || '.',

    /** Owner's WhatsApp number with country code */
    OWNER_NUMBER: process.env.OWNER_NUMBER || '33751103165',

    /** Display name of the bot */
    BOT_NAME: process.env.BOT_NAME || "SIDD FREE BOT",

    /** Footer text for bot messages */
    BOT_FOOTER: process.env.BOT_FOOTER || 'Made In By Sidd Techx Ofc',

    /** Owner name shown in menus */
    OWNER_NAME: process.env.OWNER_NAME || 'sidd ᴛechx',

    /** Bot work mode: public | private | group | inbox */
    WORK_TYPE: process.env.WORK_TYPE || "public",

    // ═══════════════════════════════════════════════════════════════════════
    //  👁️ STATUS AUTOMATION (defaults — actual values stored per-user in MongoDB)
    // ═══════════════════════════════════════════════════════════════════════

    AUTO_LIKE_EMOJI: ['❤️', '🌹', '✨', '🥰', '💖', '😍', '💞', '💕', '☺️', '🤗'],
    AUTO_STATUS_MSG: process.env.AUTO_STATUS_MSG || '*SEEN YOUR STATUS BY SIDD FREE BOT* 🤗',

    // ═══════════════════════════════════════════════════════════════════════
    //  👥 AUTO-JOIN GROUP
    // ═══════════════════════════════════════════════════════════════════════

    GROUP_INVITE_CODE: process.env.GROUP_INVITE_CODE || 'Ffdns4sciUGFPsHBrwK3c0', // Invite code only, without https://chat.whatsapp.com/

    // ═══════════════════════════════════════════════════════════════════════
    //  🛡️ ANTI-CALL (default — actual value stored per-user in MongoDB)
    // ═══════════════════════════════════════════════════════════════════════

    REJECT_MSG: process.env.REJECT_MSG || '*CALL LATER PLEASE ☺️🌹*',

    // ═══════════════════════════════════════════════════════════════════════
    //  🖼️ MEDIA & MENU
    // ═══════════════════════════════════════════════════════════════════════

    /** Image shown by the .alive command (falls back to a random image if unset) */
    ALIVE_IMG: process.env.ALIVE_IMG || '',

    /** Text shown on the .alive command's "Alive" line */
    LIVE_MSG: process.env.LIVE_MSG || 'I am active and running',

    /** Image shown by the .menu command (falls back to a random image if unset) */
    MENU_IMAGE_URL: process.env.MENU_IMAGE_URL || '',

    /** Short tagline shown at the bottom of the .menu command */
    DESCRIPTION: process.env.DESCRIPTION || 'Multi-Device WhatsApp Bot',

    /** Link shown by the .repo command */
    REPO_URL: process.env.REPO_URL || 'https://sidd-xmd.up.railway.app/#pairing'

};
