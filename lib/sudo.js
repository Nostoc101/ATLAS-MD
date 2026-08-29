// ════════════════════════════════════════════════════════════
// 📁 SUDO - Liste des numéros ayant les droits propriétaire (owner)
// Stockage en mémoire, partagé entre main.js et plugins/sudo.js
// ════════════════════════════════════════════════════════════
const sudoNumbers = new Set(); // numéros (sans @s.whatsapp.net), ex: "33751103165"

function isSudo(number) {
    return sudoNumbers.has(number);
}

function addSudo(number) {
    sudoNumbers.add(number);
}

function removeSudo(number) {
    return sudoNumbers.delete(number);
}

function listSudo() {
    return Array.from(sudoNumbers);
}

module.exports = { sudoNumbers, isSudo, addSudo, removeSudo, listSudo };
