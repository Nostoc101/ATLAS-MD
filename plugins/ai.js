const { cmd } = require('../sidd');
const { siddTechx } = require('../lib/style');
const { getAIHistory, saveAIHistory, clearAIHistory } = require('../lib/database');
const axios = require('axios');

const ADMIN_NUMBERS = global.ADMIN_NUMBERS || [];

cmd({
    pattern: "ai",
    alias: ['gpt', 'chatgpt'],
    desc: "Chat with AI - with memory",
    category: "ai",
    react: "🤖",
    use: ".ai <your question>",
    filename: __filename
},
async (conn, mek, m, { from, args, sender, reply }) => {
    try {
        const question = args.join(' ');
        if (!question) return reply(siddTechx('AI', 'Usage:.ai What is the capital of France', '❓'));

        await reply(siddTechx('AI', 'Thinking... 🤔', '⏳'));

        // Get old chat history
        let history = await getAIHistory(sender);

        // Add new question
        history.push({ role: "user", content: question });

        // Keep only last 10 messages to avoid token limit
        if(history.length > 10) history = history.slice(-10);

        // Call AI API - using free gpt endpoint
        const { data } = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are ATLAS-ULTRA AI. A helpful WhatsApp bot assistant." },
               ...history
            ]
        }, {
            headers: {
                'Authorization': 'Bearer YOUR_OPENAI_API_KEY', // <-- PUT YOUR KEY HERE
                'Content-Type': 'application/json'
            }
        });

        const answer = data.choices[0].message.content;

        // Save AI response to history
        history.push({ role: "assistant", content: answer });
        await saveAIHistory(sender, history);

        reply(siddTechx('AI', answer, '🤖'));

    } catch (e) {
        console.error('AI error:', e.message);
        reply(siddTechx('AI', 'AI is down or API key missing. Get key from platform.openai.com', '❌'));
    }
});

// CLEAR CHAT HISTORY
cmd({
    pattern: "clearai",
    desc: "Clear your AI chat history",
    category: "ai",
    react: "🧹",
    filename: __filename
},
async (conn, mek, m, { from, sender, reply }) => {
    await clearAIHistory(sender);
    reply(siddTechx('AI', '✅ Your AI chat history has been cleared', '✅'));
});