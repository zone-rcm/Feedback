const axios = require("axios");
const fs = require("fs");

const TOKEN = "471638936:wlWlUc869YCvTa6ATRuPr7NiMpIRC6j2e1NAkeAn"; // Replace with your bot token
const API_URL = `https://tapi.bale.ai/bot${TOKEN}`;
const WHITELIST = ["zonercm"]; // Replace with actual usernames
const DATA_FILE = "channels.json"; // Stores joined channels
const POSTS_FILE = "posts.json"; // Stores posts

// Load saved data
let channels = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE)) : [];
let posts = fs.existsSync(POSTS_FILE) ? JSON.parse(fs.readFileSync(POSTS_FILE)) : {};

// Save channels
const saveChannels = () => fs.writeFileSync(DATA_FILE, JSON.stringify(channels, null, 2));
// Save posts
const savePosts = () => fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));

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

// Function to send messages
async function sendMessage(chatId, text, replyMarkup = null) {
    await axios.post(`${API_URL}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: replyMarkup,
    });
}

// Function to handle updates
async function handleUpdate(update) {
    if (update.message) {
        await handleMessage(update.message);
    } else if (update.callback_query) {
        await handleCallback(update.callback_query);
    }
}

// Function to handle messages
async function handleMessage(message) {
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

    // Handle post creation (Image with Caption)
    if (posts[userId] && posts[userId].stage === "waiting_for_image") {
        if (message.photo) {
            const fileId = message.photo[message.photo.length - 1].file_id;
            posts[userId].image = fileId;
            posts[userId].caption = message.caption || "";
            posts[userId].stage = "waiting_for_buttons";
            savePosts();
            await sendMessage(chatId, "✅ Image saved. Now send inline buttons as `Text - Link`, one per line.");
        }
        return;
    }

    // Handle post creation (Text-Only)
    if (posts[userId] && posts[userId].stage === "waiting_for_text") {
        posts[userId].text = text;
        posts[userId].stage = "waiting_for_buttons";
        savePosts();
        await sendMessage(chatId, "✅ Text saved. Now send inline buttons as `Text - Link`, one per line.");
        return;
    }

    // Handle Inline Buttons
    if (posts[userId] && posts[userId].stage === "waiting_for_buttons") {
        const buttons = text.split("\n").map(line => {
            const [btnText, btnUrl] = line.split(" - ");
            return btnText && btnUrl ? [{ text: btnText, url: btnUrl }] : null;
        }).filter(Boolean);

        posts[userId].buttons = buttons;
        posts[userId].stage = "ready_to_send";
        savePosts();
        await sendMessage(chatId, "✅ Buttons saved. Press 'Send' to post it.", {
            inline_keyboard: [[{ text: "🚀 Send", callback_data: "send_post" }]]
        });
        return;
    }
}

// Function to handle callback queries
async function handleCallback(callback) {
    const userId = callback.from.username;
    const chatId = callback.message.chat.id;
    const data = callback.data;

    if (!WHITELIST.includes(userId)) return;

    // Selecting a channel
    if (data.startsWith("select_")) {
        const channelId = data.split("_")[1];
        posts[userId] = { stage: "selecting_post_type", channelId };
        savePosts();
        await sendMessage(chatId, "📌 Choose post type:", {
            inline_keyboard: [
                [{ text: "🖼 Image with Caption", callback_data: "image_post" }],
                [{ text: "📝 Text-Only", callback_data: "text_post" }]
            ]
        });
    }

    // Choosing post type
    if (data === "image_post") {
        posts[userId].stage = "waiting_for_image";
        savePosts();
        await sendMessage(chatId, "📸 Send an image with a caption.");
    } else if (data === "text_post") {
        posts[userId].stage = "waiting_for_text";
        savePosts();
        await sendMessage(chatId, "📝 Send the text content.");
    }

    // Sending the post
    if (data === "send_post") {
        const post = posts[userId];
        if (!post || !post.channelId) return;

        if (post.image) {
            await axios.post(`${API_URL}/sendPhoto`, {
                chat_id: post.channelId,
                photo: post.image,
                caption: post.caption,
                parse_mode: "Markdown",
                reply_markup: { inline_keyboard: post.buttons }
            });
        } else {
            await sendMessage(post.channelId, post.text, { inline_keyboard: post.buttons });
        }

        delete posts[userId];
        savePosts();
        await sendMessage(chatId, "✅ Post sent successfully!");
    }
}

// Start bot polling
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

// Run bot
startBot();
