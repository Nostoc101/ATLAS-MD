const fs = require("fs");
const path = require("path");

const commands = [];

/**
 * Register a command.
 * @param {Object} info - { pattern, alias, desc, category }
 * @param {Function} callback - async (m, sock) => {}
 */
function cmd(info, callback) {
    const command = {
        pattern: info.pattern,
        alias: Array.isArray(info.alias) ? info.alias : (info.alias ? [info.alias] : []),
        desc: info.desc || "",
        category: info.category || "general",
        callback
    };
    commands.push(command);
    return command;
}

/**
 * Find a command by its pattern or alias (case-insensitive).
 */
function findCommand(name) {
    if (!name) return null;
    const lower = name.toLowerCase();
    return commands.find(c =>
        c.pattern.toLowerCase() === lower ||
        c.alias.some(a => a.toLowerCase() === lower)
    ) || null;
}

/**
 * Return all registered commands.
 */
function getCommands() {
    return commands;
}

/**
 * Scan plugins/ and load every .js file automatically.
 * Errors in a single plugin do not stop the others from loading.
 */
function loadPlugins(pluginsDir) {
    const dir = pluginsDir || path.join(__dirname, "plugins");
    let loaded = 0;
    let failed = 0;

    if (!fs.existsSync(dir)) {
        console.log(`✗ Plugins directory not found: ${dir}`);
        return { loaded, failed };
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));

    for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
            delete require.cache[require.resolve(fullPath)];
            require(fullPath);
            console.log(`✓ Loaded: ${file}`);
            loaded++;
        } catch (err) {
            console.log(`✗ Failed to load plugin: ${file}`);
            console.log(`  Reason: ${err.message}`);
            failed++;
        }
    }

    return { loaded, failed };
}

module.exports = {
    cmd,
    findCommand,
    getCommands,
    loadPlugins
};
