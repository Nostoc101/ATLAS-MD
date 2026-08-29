// ════════════════════════════════════════════════════════════
// 📁 IMAGES - Liste des images du bot, une différente à chaque appel
// ════════════════════════════════════════════════════════════
const botImages = [
    'https://files.catbox.moe/7rk7v9.png',
    'https://files.catbox.moe/cbeono.png',
    'https://files.catbox.moe/btwpzu.jpg',
    'https://files.catbox.moe/fc4g2c.jpg',
];

function randomImage() {
    return botImages[Math.floor(Math.random() * botImages.length)];
}

module.exports = { botImages, randomImage };
