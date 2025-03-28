const axios = require('axios');

// ===== CONFIGURATION ===== //
const CONFIG = {
    BOT_TOKEN: '2124491577:SmMBycCEHXV5JzwfS8tKmM71Kmi4zlpcA8IxdFCs',
    TARGET_USERNAME: 'zonercm', // Only this user can use .raid
    POLLING_INTERVAL: 75, // 100ms for instant responses
    API_BASE_URL: 'https://tapi.bale.ai/bot'
};

// ===== GLOBALS ===== //
let LAST_UPDATE_ID = 0;
const activeRaids = new Map(); // Stores active raids
const userStates = new Map(); // Tracks user input state

// ===== UTILITIES ===== //
const PERSIAN_NUMERALS = {
    '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4,
    '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9
};

const parsePersianNumber = (text) => parseInt(
    text.toString()
        .split('')
        .map(c => PERSIAN_NUMERALS[c] || c)
        .join('')
);

const isValidLink = (link) => /^(https?:\/\/t\.me\/|@)[\w-]+$/i.test(link);

// ===== TELEGRAM API WRAPPER ===== //
const api = {
    call: async (method, data) => {
        try {
            const res = await axios.post(`${CONFIG.API_BASE_URL}${CONFIG.BOT_TOKEN}/${method}`, data);
            return res.data;
        } catch (err) {
            console.error(`API Error (${method}):`, err.response?.data || err.message);
            return null;
        }
    },
    sendMessage: (chatId, text, options = {}) => 
        api.call('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', ...options }),
    editMessageText: (chatId, messageId, text, options = {}) =>
        api.call('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown', ...options }),
    answerCallbackQuery: (callbackQueryId, text, showAlert = false) =>
        api.call('answerCallbackQuery', { callback_query_id: callbackQueryId, text, show_alert: showAlert })
};

// ===== RAID MANAGEMENT ===== //
const createRaidAnnouncement = async (chatId, raidId, reason, link, maxPeople) => {
    const message = `
⚔️ *رید جدید* ⚔️  
━━━━━━━━━━━━━━  
🔹 *دلیل:* ${reason}  
🔹 *لینک:* ${link}  
🔹 *ظرفیت:* 0/${maxPeople} نفر  
━━━━━━━━━━━━━━  
    `;

    const keyboard = {
        inline_keyboard: [[
            { text: "✅ شرکت در رید", callback_data: `join_${raidId}` }
        ]]
    };

    const { message_id } = (await api.sendMessage(chatId, message, { reply_markup: keyboard }))?.result || {};
    return message_id;
};

const updateRaidMessage = async (chatId, messageId, raidId) => {
    const raid = activeRaids.get(raidId);
    if (!raid) return;

    const participantsList = raid.participants.length > 0 
        ? raid.participants.map((p, i) => `▫️ ${i + 1}. ${p.first_name} (@${p.username || 'ناشناس'})`).join('\n')
        : '▫️ هنوز کسی ثبت نام نکرده است';

    const updatedMessage = `
⚔️ *رید فعال* ⚔️  
━━━━━━━━━━━━━━  
🔹 *دلیل:* ${raid.reason}  
🔹 *لینک:* ${raid.link}  
🔹 *ظرفیت:* ${raid.participants.length}/${raid.maxPeople} نفر  
━━━━━━━━━━━━━━  
${participantsList}
━━━━━━━━━━━━━━  
    `;

    await api.editMessageText(chatId, messageId, updatedMessage, {
        reply_markup: { inline_keyboard: [[
            { text: "✅ شرکت در رید", callback_data: `join_${raidId}` }
        ]]}
    });
};

// ===== HANDLERS ===== //
const handleMessage = async (message) => {
    const { chat, from, text } = message;
    if (!from || from.username?.toLowerCase() !== CONFIG.TARGET_USERNAME.toLowerCase()) return;

    if (text?.startsWith('.raid')) {
        userStates.set(from.id, { step: 'reason' });
        await api.sendMessage(chat.id, "📝 *لطفا دلیل رید را وارد کنید:*");
        return;
    }

    const userState = userStates.get(from.id);
    if (!userState) return;

    switch (userState.step) {
        case 'reason':
            userState.reason = text;
            userState.step = 'link';
            await api.sendMessage(chat.id, "🔗 *لینک چنل/گروه را وارد کنید (مثال: @channel یا t.me/channel):*");
            break;

        case 'link':
            if (!isValidLink(text)) {
                await api.sendMessage(chat.id, "⚠️ *لینک نامعتبر! فقط لینک‌های @channel یا t.me/channel قابل قبول هستند.*");
                return;
            }
            userState.link = text;
            userState.step = 'maxPeople';
            await api.sendMessage(chat.id, "👥 *تعداد نفرات مورد نیاز را وارد کنید (مثال: ۵ یا 8):*");
            break;

        case 'maxPeople':
            const maxPeople = parsePersianNumber(text);
            if (isNaN(maxPeople) {
                await api.sendMessage(chat.id, "⚠️ *عدد نامعتبر! لطفا یک عدد صحیح وارد کنید.*");
                return;
            }

            const raidId = Date.now().toString();
            activeRaids.set(raidId, {
                creatorId: from.id,
                reason: userState.reason,
                link: userState.link,
                maxPeople,
                participants: [],
                messageId: null
            });

            const messageId = await createRaidAnnouncement(chat.id, raidId, userState.reason, userState.link, maxPeople);
            activeRaids.get(raidId).messageId = messageId;
            userStates.delete(from.id);
            break;
    }
};

const handleCallbackQuery = async (callbackQuery) => {
    const { id, from, message, data } = callbackQuery;
    const raidId = data.split('_')[1];
    const raid = activeRaids.get(raidId);

    if (!raid) {
        await api.answerCallbackQuery(id, "❌ این رید دیگر فعال نیست!", true);
        return;
    }

    if (raid.participants.some(p => p.id === from.id)) {
        await api.answerCallbackQuery(id, "⚠️ شما قبلا در این رید ثبت نام کرده‌اید!", true);
        return;
    }

    if (raid.participants.length >= raid.maxPeople) {
        await api.answerCallbackQuery(id, "❌ ظرفیت این رید تکمیل شده است!", true);
        return;
    }

    raid.participants.push({
        id: from.id,
        first_name: from.first_name,
        username: from.username
    });

    await updateRaidMessage(message.chat.id, message.message_id, raidId);
    await api.answerCallbackQuery(id, `✅ شما با موفقیت ثبت نام کردید! (${raid.participants.length}/${raid.maxPeople})`, true);
};

// ===== MAIN POLLING LOOP ===== //
const pollUpdates = async () => {
    try {
        const updates = await api.call('getUpdates', {
            offset: LAST_UPDATE_ID + 1,
            timeout: 30,
            allowed_updates: ['message', 'callback_query']
        });

        if (!updates?.ok || !updates.result?.length) return;

        for (const update of updates.result) {
            LAST_UPDATE_ID = update.update_id;
            if (update.message) await handleMessage(update.message);
            if (update.callback_query) await handleCallbackQuery(update.callback_query);
        }
    } catch (err) {
        console.error("Polling error:", err.message);
    } finally {
        setTimeout(pollUpdates, CONFIG.POLLING_INTERVAL);
    }
};

// ===== START BOT ===== //
console.log(`⚡ Raid Bot is running for @${CONFIG.TARGET_USERNAME} (${CONFIG.POLLING_INTERVAL}ms polling)`);
pollUpdates();
