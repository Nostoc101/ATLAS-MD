const { cmd } = require('../sidd');
const config = require('../config');
const axios = require('axios');
const yts = require('yt-search');
const { fakevCard } = require('../lib/fakevCard');
const style = require('../lib/style');

const TEXT = {
    example: 'EXAMPLE:\n.video pasoori',
    notFound: 'NO VIDEO FOUND.',
    found: 'VIDEO FOUND',
    title: 'TITLE',
    duration: 'DURATION',
    sending: 'SENDING VIDEO...',
    apiError: 'VIDEO API ERROR.',
    error: 'VIDEO ERROR.'
};

cmd({
    pattern: 'video',
    alias: ['ytvideo', 'ytv'],
    desc: 'Download YouTube Video',
    category: 'download',
    react: '🎬',
    filename: __filename
}, async (conn, mek, m, { from, reply, text }) => {

    try {

        if (!text || !text.trim()) {
            return reply(style.box('VIDEO', TEXT.example));
        }

        const query = text.trim();

        /* 🔍 YOUTUBE SEARCH */
        const search = await yts(query);

        if (!search || !search.videos || !search.videos.length) {
            return reply(style.box('VIDEO', TEXT.notFound));
        }

        const vid = search.videos[0];

        /* 🎨 PREVIEW */
        const caption = `${style.box('VIDEO', [
            TEXT.found,
            `${TEXT.title}: ${vid.title}`,
            `${TEXT.duration}: ${vid.timestamp}`,
            TEXT.sending
        ])}\n\n> Made In By Sidd Techx Ofc`;

        await conn.sendMessage(
            from,
            {
                image: { url: vid.thumbnail },
                caption
            },
            { quoted: fakevCard }
        );

        /* 🎥 VIDEO API */
        const api =
            `https://arslan-apis-v2.vercel.app/download/ytmp4?url=${encodeURIComponent(vid.url)}`;

        const res = await axios.get(api, {
            timeout: 60000
        });

        if (
            !res.data ||
            !res.data.status ||
            !res.data.result ||
            !res.data.result.download ||
            !res.data.result.download.url
        ) {
            return reply(style.error(TEXT.apiError));
        }

        const videoUrl = res.data.result.download.url;

        const title =
            (res.data.result.metadata &&
             res.data.result.metadata.title) ||
            vid.title ||
            'YouTube Video';

        /* 🚀 SEND VIDEO */
        await conn.sendMessage(
            from,
            {
                video: {
                    url: videoUrl
                },
                mimetype: 'video/mp4',
                caption: `${style.box('VIDEO', title)}\n\n> Made In By Sidd Techx Ofc`,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid:
                            '120363413253579833@newsletter',
                        newsletterName:
                            config.BOT_NAME || '𝐒𝐈𝐃𝐃 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓',
                        serverMessageId: 3
                    }
                }
            },
            {
                quoted: fakevCard
            }
        );

        /* ✅ REACTION */
        try {
            await conn.sendMessage(from, {
                react: {
                    text: '✅',
                    key: m.key
                }
            });
        } catch (_) {}

    } catch (err) {

        console.error('VIDEO ERROR:', err);

        try {
            await conn.sendMessage(from, {
                react: {
                    text: '❌',
                    key: m.key
                }
            });
        } catch (_) {}

        return reply(style.error(TEXT.error));
    }
});
