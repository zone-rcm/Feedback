const axios = require('axios');

// ===== تنظیمات ===== //
const CONFIG = {
    BOT_TOKEN: '2124491577:SmMBycCEHXV5JzwfS8tKmM71Kmi4zlpcA8IxdFCs',
    TARGET_USERNAME: 'zonercm',
    POLLING_INTERVAL: 75,
    API_BASE_URL: 'https://tapi.bale.ai/bot'
};

// ===== ذخیره‌سازی ===== //
let LAST_UPDATE_ID = 0;
const activeRaids = new Map();
const userStates = new Map();

// ===== ابزارهای کمکی ===== //
const parsePersianNumber = text => {
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    return parseInt(text.toString().replace(/[۰-۹]/g, d => persianDigits.indexOf(d)));
};

// ===== پاسخ‌های فارسی ===== //
const RESPONSES = {
    NOT_ALLOWED: "⛔ فقط @zonercm می‌تواند از این ربات استفاده کند.",
    ASK_LINK: "🌐 لینک مقصد را وارد کنید:\n(مثال: @channel یا ble.ir/channel)",
    ASK_PEOPLE: "👥 تعداد نفرات مورد نیاز را وارد کنید:",
    INVALID_LINK: "⚠️ لینک نامعتبر!\nفقط از فرمت @channel یا ble.ir/channel استفاده کنید.",
    INVALID_NUMBER: "⚠️ تعداد نامعتبر!\nلطفا یک عدد صحیح وارد کنید.",
    RAID_CREATED: (link, max) => 
        `⚡ *رید جدید ایجاد شد!*\n\n` +
        `🔗 *لینک:* ${link}\n` +
        `👥 *ظرفیت:* ${max} نفر\n\n` +
        `👇 برای شرکت کلیک کنید:`,
    JOIN_SUCCESS: (user, current, max) => 
        `✅ ${user} به رید پیوست!\n` +
        `🔹 ${current}/${max} نفر ثبت‌نام کرده‌اند`,
    ALREADY_JOINED: user => `⚠️ ${user} قبلاً در این رید ثبت‌نام کرده است!`,
    RAID_FULL: user => `⛔ ${user} - ظرفیت رید تکمیل شده است!`,
    PARTICIPANTS: participants => 
        participants.length > 0 
            ? `🔹 *شرکت‌کنندگان:*\n${participants.map((p,i) => `▫️ ${i+1}. ${p.name} (${p.username ? '@'+p.username : 'بدون یوزرنیم'})`).join('\n')}`
            : '▫️ هنوز کسی ثبت‌نام نکرده است'
};

// ===== توابع API ===== //
const callAPI = async (method, data) => {
    try {
        const response = await axios.post(`${CONFIG.API_BASE_URL}${CONFIG.BOT_TOKEN}/${method}`, data, {
            timeout: 2000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error(`API Error (${method}):`, error.message);
        return { ok: false };
    }
};

const sendMessage = async (chatId, text, options = {}) => {
    return callAPI('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        ...options
    });
};

const editMessageText = async (chatId, messageId, text, markup) => {
    return callAPI('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'Markdown',
        reply_markup: markup
    });
};

const answerCallback = async (callbackId, text, alert = false) => {
    return callAPI('answerCallbackQuery', {
        callback_query_id: callbackId,
        text,
        show_alert: alert
    });
};

// ===== مدیریت رید ===== //
const startRaidCreation = async (chatId, userId) => {
    userStates.set(userId, { step: 'link' });
    await sendMessage(chatId, RESPONSES.ASK_LINK);
};

const processRaidInput = async (msg) => {
    const { chat, from, text } = msg;
    const state = userStates.get(from.id);

    if (!state) return;

    if (state.step === 'link') {
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
        if (isNaN(people) {
            await sendMessage(chat.id, RESPONSES.INVALID_NUMBER);
            return;
        }

        const raidId = `raid_${Date.now()}`;
        const keyboard = {
            inline_keyboard: [[
                { text: "✅ شرکت در رید", callback_data: `join_${raidId}` }
            ]]
        };

        const { result } = await sendMessage(
            chat.id,
            RESPONSES.RAID_CREATED(state.link, people),
            { reply_markup: keyboard }
        );

        activeRaids.set(raidId, {
            chatId: chat.id,
            messageId: result.message_id,
            link: state.link,
            maxPeople: people,
            participants: []
        });

        userStates.delete(from.id);
    }
};

// ===== مدیریت شرکت‌کنندگان ===== //
const handleParticipation = async (callback) => {
    const [_, raidId] = callback.data.split('_');
    const raid = activeRaids.get(raidId);
    const user = callback.from;
    const userTag = user.username ? `@${user.username}` : user.first_name;

    if (!raid) {
        await answerCallback(callback.id, "⚠️ این رید دیگر فعال نیست", true);
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

    // افزودن شرکت‌کننده
    raid.participants.push({
        id: user.id,
        name: user.first_name,
        username: user.username
    });

    // آپدیت پیام
    await editMessageText(
        raid.chatId,
        raid.messageId,
        `${RESPONSES.RAID_CREATED(raid.link, raid.maxPeople)}\n\n${RESPONSES.PARTICIPANTS(raid.participants)}`,
        {
            inline_keyboard: [[
                { text: "✅ شرکت در رید", callback_data: `join_${raidId}` }
            ]]
        }
    );

    await answerCallback(
        callback.id,
        RESPONSES.JOIN_SUCCESS(userTag, raid.participants.length, raid.maxPeople),
        true
    );
};

// ===== حلقه اصلی ===== //
const pollForUpdates = async () => {
    try {
        const { result } = await callAPI('getUpdates', {
            offset: LAST_UPDATE_ID + 1,
            timeout: 30,
            allowed_updates: ['message', 'callback_query']
        });

        if (result) {
            for (const update of result) {
                LAST_UPDATE_ID = update.update_id;

                if (update.message) {
                    if (update.message.text?.startsWith('.raid') && 
                        update.message.from.username === CONFIG.TARGET_USERNAME) {
                        await startRaidCreation(update.message.chat.id, update.message.from.id);
                    } else if (userStates.has(update.message.from.id)) {
                        await processRaidInput(update.message);
                    }
                } 
                else if (update.callback_query) {
                    await handleParticipation(update.callback_query);
                }
            }
        }
    } catch (err) {
        console.error('خطا در دریافت آپدیت:', err.message);
    } finally {
        setTimeout(pollForUpdates, CONFIG.POLLING_INTERVAL);
    }
};

// ===== شروع ربات ===== //
console.log("🤖 ربات رید برای @zonercm فعال شد!");
pollForUpdates();
