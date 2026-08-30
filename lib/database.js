const mongoose = require('mongoose');
const config = require('../config');

const connectdb = async () => {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(config.MONGODB_URI, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log("✅ Database Connected Successfully");
    } catch (e) {
        console.error("❌ Database Connection Failed:", e.message);
    }
};

// ====================================
// MODÈLES
// ===================================

const sessionSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true, index: true },
    credentials: { type: Object, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const userConfigSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true, index: true },
    config: { type: Object, default: {} },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const otpSchema = new mongoose.Schema({
    number: { type: String, required: true, index: true },
    otp: { type: String, required: true },
    config: { type: Object, required: true },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 5 * 60000), index: { expires: '5m' } },
    createdAt: { type: Date, default: Date.now }
});

const activeNumberSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true, index: true },
    lastConnected: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
});

const statsSchema = new mongoose.Schema({
    number: { type: String, required: true },
    date: { type: String, required: true },
    commandsUsed: { type: Number, default: 0 },
    messagesReceived: { type: Number, default: 0 },
    messagesSent: { type: Number, default: 0 },
    groupsInteracted: { type: Number, default: 0 }
});

const botConfigSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    admins: { type: [String], default: [] },
    remoted: { type: [String], default: [] },
    updatedAt: { type: Date, default: Date.now }
});

// NEW: AI CHAT HISTORY
const aiChatSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    messages: { type: Array, default: [] },
    updatedAt: { type: Date, default: Date.now }
});

// NEW: GLOBAL SETTINGS FOR ANTILINK/ANTIDELETE
const settingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed },
    updatedAt: { type: Date, default: Date.now }
});

const Session = mongoose.model('Session', sessionSchema);
const UserConfig = mongoose.model('UserConfig', userConfigSchema);
const OTP = mongoose.model('OTP', otpSchema);
const ActiveNumber = mongoose.model('ActiveNumber', activeNumberSchema);
const Stats = mongoose.model('Stats', statsSchema);
const BotConfig = mongoose.model('BotConfig', botConfigSchema);
const AIChat = mongoose.model('AIChat', aiChatSchema); // NEW
const Setting = mongoose.model('Setting', settingSchema); // NEW

// ====================================
// FONCTIONS - ALL YOUR CODE UNCHANGED
// ==================================

async function saveSessionToMongoDB(number, credentials) {
    try {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        await Session.findOneAndUpdate(
            { number: cleanNumber },
            { credentials: credentials, updatedAt: new Date() },
            { upsert: true, new: true }
        );
        console.log(`📁 Session saved to MongoDB for ${cleanNumber}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving session to MongoDB:', error);
        return false;
    }
}

async function getSessionFromMongoDB(number) {
    try {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        const session = await Session.findOne({ number: cleanNumber });
        return session? session.credentials : null;
    } catch (error) {
        console.error('❌ Error getting session from MongoDB:', error);
        return null;
    }
}

async function deleteSessionFromMongoDB(number) {
    try {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        await Session.deleteOne({ number: cleanNumber });
        await ActiveNumber.deleteOne({ number: cleanNumber });
        console.log(`🗑️ Session deleted from MongoDB for ${cleanNumber}`);
        return true;
    } catch (error) {
        console.error('❌ Error deleting session from MongoDB:', error);
        return false;
    }
}

async function getUserConfigFromMongoDB(number) {
    try {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        const config = await UserConfig.findOne({ number: cleanNumber });
        if (config) {
            return config.config;
        } else {
            const defaultConfig = {
                AUTO_RECORDING: 'false', AUTO_TYPING: 'false', ANTI_CALL: 'false',
                REJECT_MSG: '*🔕 ʏᴏᴜʀ ᴄᴀʟ ᴡᴀs ᴀᴜᴛᴏᴍᴀᴛɪᴄᴀʟʏ ʀᴇᴊᴇᴄᴛᴇᴅ..!*',
                READ_MESSAGE: 'false', AUTO_VIEW_STATUS: 'true', AUTO_LIKE_STATUS: 'true',
                AUTO_STATUS_REPLY: 'false', AUTO_STATUS_MSG: 'Hello from black popkid!',
                AUTO_LIKE_EMOJI: ['❤️', '👍', '😮', '😎'], AUTO_REACT: 'false',
                AUTO_REACT_EMOJI: ['👀', '🫀', '🧡', '❤️‍🩹', '❣️', '💖', '💝', '🦋', '😘', '🤍', '🥰', '🌝', '💨', '🌟', '✨', '🫦', '💐', '🌺', '🪷', '🍄', '🍁', '🪴', '🥀', '🌈', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘', '🌑', '🪽', '🍒', '🍇', '🥖', '🥢', '🛟', '🎀', '🎗️', '🎈', '🎱', '🪀', '🪄', '🪡', '🧷', '🧣', '💍', '🧸', '🔗', '🖇️', '🗞️', '📅', '🔮', '♏', '🇰🇼', '🏳️']
            };
            await UserConfig.create({ number: cleanNumber, config: defaultConfig });
            return defaultConfig;
        }
    } catch (error) {
        console.error('❌ Error getting user config from MongoDB:', error);
        return {};
    }
}

async function updateUserConfigInMongoDB(number, newConfig) {
    try {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        await UserConfig.findOneAndUpdate(
            { number: cleanNumber },
            { config: newConfig, updatedAt: new Date() },
            { upsert: true, new: true }
        );
        console.log(`⚙️ Config updated for ${cleanNumber}`);
        return true;
    } catch (error) {
        console.error('❌ Error updating user config in MongoDB:', error);
        return false;
    }
}

async function saveOTPToMongoDB(number, otp, config) {
    try {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        await OTP.create({ number: cleanNumber, otp: otp, config: config });
        console.log(`🔐 OTP saved for ${cleanNumber}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving OTP to MongoDB:', error);
        return false;
    }
}

async function verifyOTPFromMongoDB(number, otp) {
    try {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        const otpRecord = await OTP.findOne({ number: cleanNumber, otp: otp, expiresAt: { $gt: new Date() } });
        if (!otpRecord) { return { valid: false, error: 'Invalid or expired OTP' }; }
        await OTP.deleteOne({ _id: otpRecord._id });
        return { valid: true, config: otpRecord.config };
    } catch (error) {
        console.error('❌ Error verifying OTP from MongoDB:', error);
        return { valid: false, error: 'Verification error' };
    }
}

async function addNumberToMongoDB(number) {
    try {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        await ActiveNumber.findOneAndUpdate(
            { number: cleanNumber }, { lastConnected: new Date(), isActive: true },
            { upsert: true, new: true }
        );
        return true;
    } catch (error) {
        console.error('❌ Error adding number to MongoDB:', error);
        return false;
    }
}

async function removeNumberFromMongoDB(number) {
    try {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        await ActiveNumber.deleteOne({ number: cleanNumber });
        return true;
    } catch (error) {
        console.error('❌ Error removing number from MongoDB:', error);
        return false;
    }
}

async function getAllNumbersFromMongoDB() {
    try {
        const activeNumbers = await ActiveNumber.find({ isActive: true });
        return activeNumbers.map(num => num.number);
    } catch (error) {
        console.error('❌ Error getting numbers from MongoDB:', error);
        return [];
    }
}

async function incrementStats(number, field) {
    try {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        const today = new Date().toISOString().split('T')[0];
        await Stats.findOneAndUpdate(
            { number: cleanNumber, date: today }, { $inc: { [field]: 1 } },
            { upsert: true, new: true }
        );
    } catch (error) {
        console.error('❌ Error updating stats:', error);
    }
}

async function getStatsForNumber(number) {
    try {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        const stats = await Stats.find({ number: cleanNumber }).sort({ date: -1 }).limit(30);
        return stats;
    } catch (error) {
        console.error('❌ Error getting stats:', error);
        return [];
    }
}

async function saveBotRolesToMongoDB(admins, remoted) {
    try {
        await BotConfig.findOneAndUpdate(
            { _id: 'atlas_roles' },
            { admins: admins, remoted: remoted, updatedAt: new Date() },
            { upsert: true, new: true }
        );
        console.log(`🛡️ Roles saved to MongoDB: ${admins.length} admins`);
        return true;
    } catch (error) {
        console.error('❌ Error saving roles to MongoDB:', error);
        return false;
    }
}

async function getBotRolesFromMongoDB() {
    try {
        const data = await BotConfig.findOne({ _id: 'atlas_roles' });
        return data || { admins: [], remoted: [] };
    } catch (error) {
        console.error('❌ Error getting roles from MongoDB:', error);
        return { admins: [], remoted: [] };
    }
}

// ====================================
// NEW FUNCTIONS ADDED FOR AI + SETTINGS
// ====================================
async function getSetting(key) {
    const data = await Setting.findOne({ key });
    return data? data.value : false;
}
async function setSetting(key, value) {
    await Setting.findOneAndUpdate({ key }, { value, updatedAt: new Date() }, { upsert: true });
}
async function getAIHistory(userId) {
    const cleanId = userId.replace(/[^0-9]/g, '');
    const data = await AIChat.findOne({ userId: cleanId });
    return data? data.messages : [];
}
async function saveAIHistory(userId, messages) {
    const cleanId = userId.replace(/[^0-9]/g, '');
    await AIChat.findOneAndUpdate({ userId: cleanId }, { messages, updatedAt: new Date() }, { upsert: true });
}
async function clearAIHistory(userId) {
    const cleanId = userId.replace(/[^0-9]/g, '');
    await AIChat.deleteOne({ userId: cleanId });
}

// =================================
// EXPORTS - ADDED NEW ONES AT END
// =================================
module.exports = {
    connectdb,
    Session, UserConfig, OTP, ActiveNumber, Stats, BotConfig, AIChat, Setting,
    saveSessionToMongoDB, getSessionFromMongoDB, deleteSessionFromMongoDB,
    getUserConfigFromMongoDB, updateUserConfigInMongoDB,
    saveOTPToMongoDB, verifyOTPFromMongoDB,
    addNumberToMongoDB, removeNumberFromMongoDB, getAllNumbersFromMongoDB,
    incrementStats, getStatsForNumber,
    saveBotRolesToMongoDB, getBotRolesFromMongoDB,
    getSetting, setSetting, // ADDED
    getAIHistory, saveAIHistory, clearAIHistory, // ADDED
    getUserConfig: async (number) => { const config = await getUserConfigFromMongoDB(number); return config || {}; },
    updateUserConfig: updateUserConfigInMongoDB
};