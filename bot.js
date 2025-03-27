const axios = require("axios");

const BOT_TOKEN = "1160037511:UNYPZY1GhLScNYpI1bLIJ77wayIqELOjtT48mbaJ";
const CHANNEL_ID = 5272323810;
const API_URL = `https://tapi.bale.ai/bot${BOT_TOKEN}`;

const users = new Set(); // Stores user IDs
const whitelist = new Set(["zonercm"]); // Whitelisted users
const files = new Map(); // Maps start codes to files
const texts = new Map(); // Maps start codes to texts
const pendingActions = new Map(); // Stores pending admin actions
const lastCommands = new Map(); // Stores last user commands

// Function to send a message
const sendMessage = async (chatId, text, options = {}) => {
    await axios.post(`${API_URL}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        ...options,
    }).catch(console.error);
};

// Check if user is in the channel
const isUserInChannel = async (userId) => {
    try {
        const res = await axios.get(`${API_URL}/getChatMember`, {
            params: { chat_id: CHANNEL_ID, user_id: userId },
        });
        const status = res.data.result.status;
        return status === "member" || status === "administrator" || status === "creator";
    } catch {
        return false;
    }
};

// Handle updates
const processUpdate = async (update) => {
    if (!update.message) return;
    const msg = update.message;
    const chatId = msg.chat.id;
    const username = msg.from.username;
    const firstName = msg.from.first_name;
    const userId = msg.from.id;

    // Greet user with Persian time
    const now = new Date().toLocaleString("fa-IR", { timeZone: "Asia/Tehran" });
    sendMessage(chatId, `سلام ${firstName}!\n🕰 تاریخ و زمان ایران: ${now}`);

    // Check if user is in the channel
    if (!(await isUserInChannel(userId))) {
        return sendMessage(chatId, "⛔️ ابتدا به کانال بپیوندید!", {
            reply_markup: {
                inline_keyboard: [[
                    { text: "📢 پیوستن", url: `https://t.me/${CHANNEL_ID.replace("@", "")}` },
                    { text: "✅ بررسی عضویت", callback_data: "check_join" },
                ]],
            },
        });
    }

    users.add(userId); // Capture user ID

    // Store last command if they need to re-run it after joining
    if (msg.text) lastCommands.set(userId, msg.text);

    // Admin panel
    if (msg.text === "پنل" && whitelist.has(username)) {
        sendMessage(chatId, `🎛 پنل مدیریت\n🕰 زمان: ${now}`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📂 ارسال فایل", callback_data: "upload_file" }],
                    [{ text: "📝 ارسال متن", callback_data: "upload_text" }],
                    [{ text: "📢 ارسال پیام به کاربران", callback_data: "broadcast" }],
                    [{ text: "🖼 ارسال تصویر با کپشن", callback_data: "broadcast_image" }],
                ],
            },
        });
    }

    // File upload handling
    if (pendingActions.get(userId) === "upload_file" && msg.document) {
        const fileCode = Math.random().toString(36).substr(2, 6);
        files.set(fileCode, msg.document.file_id);
        sendMessage(chatId, `✅ فایل دریافت شد!\n📥 لینک: /start_${fileCode}`);
        pendingActions.delete(userId);
    }

    // Text upload handling
    if (pendingActions.get(userId) === "upload_text" && msg.text) {
        const textCode = Math.random().toString(36).substr(2, 6);
        texts.set(textCode, msg.text);
        sendMessage(chatId, `✅ متن ذخیره شد!\n📥 لینک: /start_${textCode}`);
        pendingActions.delete(userId);
    }

    // Sending stored files and texts
    if (msg.text.startsWith("/start_")) {
        const code = msg.text.replace("/start_", "");
        if (files.has(code)) {
            axios.post(`${API_URL}/sendDocument`, {
                chat_id: chatId,
                document: files.get(code),
            });
        } else if (texts.has(code)) {
            sendMessage(chatId, texts.get(code));
        }
    }
};

// Handle callback queries
const processCallbackQuery = async (callback) => {
    const chatId = callback.message.chat.id;
    const userId = callback.from.id;
    const username = callback.from.username;

    if (callback.data === "check_join") {
        if (await isUserInChannel(userId)) {
            axios.post(`${API_URL}/deleteMessage`, {
                chat_id: chatId,
                message_id: callback.message.message_id,
            });
            if (lastCommands.has(userId)) {
                sendMessage(chatId, `✅ شما اکنون عضو شدید! درحال اجرای دستور قبلی...`);
                processUpdate({ message: { chat: { id: chatId }, text: lastCommands.get(userId), from: { id: userId, username } } });
                lastCommands.delete(userId);
            }
        } else {
            sendMessage(chatId, "❌ هنوز عضو نیستید!");
        }
    } else if (callback.data === "upload_file" && whitelist.has(username)) {
        sendMessage(chatId, "📂 لطفاً فایل را ارسال کنید.");
        pendingActions.set(userId, "upload_file");
    } else if (callback.data === "upload_text" && whitelist.has(username)) {
        sendMessage(chatId, "📝 لطفاً متن خود را ارسال کنید.");
        pendingActions.set(userId, "upload_text");
    } else if (callback.data === "broadcast" && whitelist.has(username)) {
        sendMessage(chatId, "📢 لطفاً پیام خود را برای ارسال به کاربران وارد کنید.");
        pendingActions.set(userId, "broadcast");
    } else if (callback.data === "broadcast_image" && whitelist.has(username)) {
        sendMessage(chatId, "🖼 لطفاً تصویر خود را ارسال کنید.");
        pendingActions.set(userId, "broadcast_image");
    }
};

// Long polling function
const startBot = async () => {
    let lastUpdateId = 0;
    while (true) {
        try {
            const res = await axios.get(`${API_URL}/getUpdates`, { params: { offset: lastUpdateId + 1, timeout: 30 } });
            for (const update of res.data.result) {
                lastUpdateId = update.update_id;
                if (update.message) processUpdate(update);
                if (update.callback_query) processCallbackQuery(update.callback_query);
            }
        } catch (err) {
            console.error("❌ Error fetching updates:", err.message);
        }
    }
};

// Start bot
startBot();
