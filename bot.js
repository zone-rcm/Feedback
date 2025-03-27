const axios = require("axios");
const fs = require("fs");

const TOKEN = "471638936:wlWlUc869YCvTa6ATRuPr7NiMpIRC6j2e1NAkeAn";
const API_URL = `https://tapi.bale.ai/bot${TOKEN}`;
const WHITELIST = ["zonercm"]; // Add usernames here
const DATA_FILE = "channels.json"; // Stores joined channels

// Load saved channels
let channels = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE)) : [];

// Function to save channels
const saveChannels = () => fs.writeFileSync(DATA_FILE, JSON.stringify(channels, null, 2));

// Function to get updates
async function getUpdates(offset) {
    try {
        const res = await axios.get(`${API_URL}/getUpdates`, { params: { offset, timeout: 30 } });
        return res.data.result;
    } catch (error) {
        console.error("Error fetching updates:", error.message);
        return [];
    }
}

// Function to send a message
async function sendMessage(chatId, text, replyMarkup = null) {
    await axios.post(`${API_URL}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: replyMarkup,
    });
}

// Function to handle incoming messages
async function handleUpdate(update) {
    const message = update.message;
    if (!message || !message.from) return;

    const userId = message.from.username;
    const chatId = message.chat.id;
    const text = message.text;

    // Save new channel/group IDs
    if (message.chat.type === "supergroup" || message.chat.type === "channel") {
        if (!channels.some(ch => ch.id === chatId)) {
            channels.push({ id: chatId, name: message.chat.title });
            saveChannels();
        }
    }

    // Check if user is whitelisted
    if (!WHITELIST.includes(userId)) return;

    // Show panel
    if (text === "پنل") {
        const buttons = channels.map(ch => [{ text: ch.name, callback_data: `select_${ch.id}` }]);
        await sendMessage(chatId, "📢 Select a channel:", { inline_keyboard: buttons });
    }
}

// Function to process updates continuously
async function startBot() {
    let offset = 0;
    while (true) {
        const updates = await getUpdates(offset);
        for (const update of updates) {
            offset = update.update_id + 1;
            await handleUpdate(update);
        }
    }
}

// Start the bot
startBot();
