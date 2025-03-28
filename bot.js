const axios = require('axios');

// ===== تنظیمات ===== //
const CONFIG = {
    BOT_TOKEN: '2124491577:SmMBycCEHXV5JzwfS8tKmM71Kmi4zlpcA8IxdFCs',
    TARGET_USERNAME: 'zonercm',
    POLLING_INTERVAL: 75 // 75ms polling
};

// ===== ذخیره‌سازی ===== //
let LAST_UPDATE_ID = 0;
const activeRaids = new Map();
const userStates = new Map();

// ===== ابزارهای کمکی ===== //
const parsePersianNumber = text => parseInt(text.toString().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

// ===== پاسخ‌های فارسی ===== //
const RESPONSES = {
    NOT_ALLOWED: "⛔ فقط @zonercm می‌تواند از این ربات استفاده کند.",
    ASK_REASON: "📝 دلیل رید را وارد کنید:",
    ASK_LINK: "🔗 لینک را وارد کنید (مثال: @channel یا ble.ir/channel):",
    ASK_PEOPLE: "👥 تعداد نفرات مورد نیاز را وارد کنید (مثال: ۵ یا 10):",
    INVALID_LINK: "⚠️ لینک نامعتبر! فقط از فرمت @channel یا ble.ir/channel استفاده کنید.",
    INVALID_NUMBER: "⚠️ عدد نامعتبر! لطفا یک عدد صحیح وارد کنید.",
    RAID_CREATED: (link, max) => `⚡ رید ایجاد شد!\n\n🔹 لینک: ${link}\n👥 ظرفیت: 0/${max} نفر`,
    JOIN_SUCCESS: (user, current, max) => `✅ ${user} ثبت نام کرد! (${current}/${max})`,
    ALREADY_JOINED: user => `⚠️ ${user} قبلاً ثبت نام کرده!`,
    RAID_FULL: user => `⛔ ${user} - ظرفیت تکمیل شد!`
};

// ===== توابع API ===== //
const sendMessage = async (chatId, text, options = {}) => {
    return axios.post(`https://tapi.bale.ai/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...options
    });
};

const editMessageText = async (chatId, messageId, text, markup) => {
    return axios.post(`https://tapi.bale.ai/bot${CONFIG.BOT_TOKEN}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: markup,
        parse_mode: 'HTML'
    });
};

const answerCallback = async (callbackId, text, alert = false) => {
    return axios.post(`https://tapi.bale.ai/bot${CONFIG.BOT_TOKEN}/answerCallbackQuery`, {
        callback_query_id: callbackId,
        text,
        show_alert: alert
    });
};

// ===== پردازش رید ===== //
const createRaid = async (chatId, userId) => {
    userStates.set(userId, { step: 'reason' });
    await sendMessage(chatId, RESPONSES.ASK_REASON);
};

const processInput = async (msg) => {
    const { chat, from, text } = msg;
    const state = userStates.get(from.id);

    if (!state) return;

    if (state.step === 'reason') {
        state.reason = text;
        state.step = 'link';
        await sendMessage(chat.id, RESPONSES.ASK_LINK);
    } 
    else if (state.step === 'link') {
        if (!text.match(/^(https?:\/\/ble\.ir\/|@)[\w-]+$/i)) {
            await sendMessage(chat.id, RESPONSES.INVALID_LINK);
            return;
        }
        state.link = text;
        state.step = 'people';
        await sendMessage(chat.id, RESPONSES.ASK_PEOPLE);
    }
    else if (state.step === 'people') {
        const people = parsePersianNumber(text);
        if (isNaN(people)) {
            await sendMessage(chat.id, RESPONSES.INVALID_NUMBER);
            return;
        }

        const raidId = Date.now().toString();
        const keyboard = {
            inline_keyboard: [[{ text: "✅ شرکت در رید", callback_data: `join_${raidId}` }]]
        };

        const { data } = await sendMessage(chat.id, RESPONSES.RAID_CREATED(state.link, people), {
            reply_markup: keyboard
        });

        activeRaids.set(raidId, {
            chatId: chat.id,
            messageId: data.result.message_id,
            link: state.link,
            maxPeople: people,
            participants: []
        });

        userStates.delete(from.id);
    }
};

// ===== مدیریت شرکت‌کنندگان ===== //
const handleJoin = async (callback) => {
    const raidId = callback.data.split('_')[1];
    const raid = activeRaids.get(raidId);
    const user = callback.from;
    const userTag = user.username ? `@${user.username}` : user.first_name;

    if (!raid) {
        await answerCallback(callback.id, "⚠️ این رید منقضی شده است", true);
        return;
    }

    // بررسی تکراری نبودن
    if (raid.participants.some(p => p.id === user.id)) {
        await answerCallback(callback.id, RESPONSES.ALREADY_JOINED(userTag), true);
        return;
    }

    // بررسی ظرفیت
    if (raid.participants.length >= raid.maxPeople) {
        await answerCallback(callback.id, RESPONSES.RAID_FULL(userTag), true);
        return;
    }

    // افزودن کاربر
    raid.participants.push({
        id: user.id,
        name: user.first_name,
        username: user.username
    });

    // آپدیت پیام
    await editMessageText(
        raid.chatId,
        raid.messageId,
        `${RESPONSES.RAID_CREATED(raid.link, raid.maxPeople)}\n\n🔹 شرکت‌کنندگان: ${raid.participants.length}/${raid.maxPeople}`,
        { inline_keyboard: [[{ text: "✅ شرکت در رید", callback_data: `join_${raidId}` }]] }
    );

    await answerCallback(callback.id, RESPONSES.JOIN_SUCCESS(userTag, raid.participants.length, raid.maxPeople), true);
};

// ===== حلقه اصلی ===== //
const pollUpdates = async () => {
    try {
        const { data } = await axios.post(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/getUpdates`, {
            offset: LAST_UPDATE_ID + 1,
            timeout: 30
        });

        if (data.ok) {
            for (const update of data.result) {
                LAST_UPDATE_ID = update.update_id;
                
                if (update.message) {
                    if (update.message.text?.startsWith('.raid') && 
                        update.message.from.username === CONFIG.TARGET_USERNAME) {
                        await createRaid(update.message.chat.id, update.message.from.id);
                    } else if (userStates.has(update.message.from.id)) {
                        await processInput(update.message);
                    }
                } 
                else if (update.callback_query) {
                    await handleJoin(update.callback_query);
                }
            }
        }
    } catch (err) {
        console.error('خطا در دریافت آپدیت:', err.message);
    } finally {
        setTimeout(pollUpdates, CONFIG.POLLING_INTERVAL);
    }
};

console.log("🤖 ربات رید برای @zonercm فعال شد!");
pollUpdates();
