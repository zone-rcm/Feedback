const axios = require('axios');

// Config
const BOT_TOKEN = '2124491577:SmMBycCEHXV5JzwfS8tKmM71Kmi4zlpcA8IxdFCs';
const TARGET_USER = 'zonercm'; // Only responds to this user
const POLL_INTERVAL = 75; // 75ms ultra-fast polling

// Storage
const activeRaids = new Map();
const userState = new Map();

// Convert Persian numbers (e.g., "۵" → 5)
const parseNumbers = (text) => parseInt(text.toString().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) || 0;

// Telegram API call
const callAPI = async (method, data) => {
    try {
        const res = await axios.post(`https://tapi.bale.ai/bot${BOT_TOKEN}/${method}`, data, { timeout: 2000 });
        return res.data;
    } catch (err) {
        console.error('API Error:', err.message);
        return { ok: false };
    }
};

// Persian responses
const PERSIAN_RESPONSES = {
    NOT_ALLOWED: "⛔ فقط کاربر @zonercm مجاز به استفاده از این ربات است.",
    ASK_REASON: "📝 دلیل رید را وارد کنید:",
    ASK_LINK: "🔗 لینک را وارد کنید (مثال: @channel یا ble.ir/channel):",
    ASK_PEOPLE: "👥 تعداد نفرات مورد نیاز را وارد کنید (مثال: ۵ یا 10):",
    INVALID_LINK: "⚠️ لینک نامعتبر! فقط از فرمت @channel یا ble.ir/channel استفاده کنید.",
    INVALID_NUMBER: "⚠️ عدد نامعتبر! لطفا یک عدد صحیح وارد کنید.",
    RAID_CREATED: (link, people) => `⚡ رید ایجاد شد!\n\n🔹 لینک: ${link}\n👥 ظرفیت: 0/${people} نفر\n\n✅ برای شرکت دکمه زیر را بزنید:`,
    JOIN_SUCCESS: (user, current, max) => `✅ کاربر ${user} ثبت نام کرد! (${current}/${max})`,
    ALREADY_JOINED: (user) => `⚠️ کاربر ${user} قبلا در این رید ثبت نام کرده است!`,
    RAID_FULL: (user) => `⛔ کاربر ${user} - ظرفیت رید تکمیل شده است!`,
    PARTICIPANT_LIST: (participants) => participants.length > 0 
        ? `🔹 شرکت کنندگان:\n${participants.map((p,i) => `${i+1}. ${p.name} (@${p.username || 'بدون یوزرنیم'})`).join('\n')}`
        : '🔹 هنوز کسی ثبت نام نکرده است'
};

// Handle .raid command
const handleRaidStart = async (chatId, userId) => {
    userState.set(userId, { step: 'reason' });
    await callAPI('sendMessage', { 
        chat_id: chatId, 
        text: PERSIAN_RESPONSES.ASK_REASON 
    });
};

// Process user input
const processInput = async (msg) => {
    const { chat, from, text } = msg;
    const state = userState.get(from.id);

    if (!state) return;

    switch (state.step) {
        case 'reason':
            state.reason = text;
            state.step = 'link';
            await callAPI('sendMessage', { 
                chat_id: chat.id, 
                text: PERSIAN_RESPONSES.ASK_LINK 
            });
            break;

        case 'link':
            if (!text.match(/^(https?:\/\/ble\.ir\/|@)[\w-]+$/i)) {
                await callAPI('sendMessage', { 
                    chat_id: chat.id, 
                    text: PERSIAN_RESPONSES.INVALID_LINK 
                });
                return;
            }
            state.link = text;
            state.step = 'people';
            await callAPI('sendMessage', { 
                chat_id: chat.id, 
                text: PERSIAN_RESPONSES.ASK_PEOPLE 
            });
            break;

        case 'people':
            const people = parseNumbers(text);
            if (isNaN(people)) {
                await callAPI('sendMessage', { 
                    chat_id: chat.id, 
                    text: PERSIAN_RESPONSES.INVALID_NUMBER 
                });
                return;
            }

            const raidId = Date.now().toString();
            activeRaids.set(raidId, {
                link: state.link,
                maxPeople: people,
                participants: [],
                messageId: null
            });

            const message = await callAPI('sendMessage', {
                chat_id: chat.id,
                text: PERSIAN_RESPONSES.RAID_CREATED(state.link, people),
                reply_markup: {
                    inline_keyboard: [[
                        { text: "✅ شرکت در رید", callback_data: `join_${raidId}` }
                    ]]
                }
            });

            if (message.ok) {
                activeRaids.get(raidId).messageId = message.result.message_id;
            }
            userState.delete(from.id);
            break;
    }
};

// Handle callback queries
const handleCallback = async (callback) => {
    const { data, from, message } = callback;
    const raidId = data.split('_')[1];
    const raid = activeRaids.get(raidId);

    if (!raid) {
        await callAPI('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: "⚠️ این رید دیگر فعال نیست"
        });
        return;
    }

    const userTag = from.username ? `@${from.username}` : from.first_name;
    
    // Check if already joined
    if (raid.participants.some(p => p.id === from.id)) {
        await callAPI('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: PERSIAN_RESPONSES.ALREADY_JOINED(userTag),
            show_alert: true
        });
        return;
    }

    // Check if raid is full
    if (raid.participants.length >= raid.maxPeople) {
        await callAPI('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: PERSIAN_RESPONSES.RAID_FULL(userTag),
            show_alert: true
        });
        return;
    }

    // Add participant
    raid.participants.push({
        id: from.id,
        name: from.first_name,
        username: from.username
    });

    // Update raid message
    await callAPI('editMessageText', {
        chat_id: message.chat.id,
        message_id: message.message_id,
        text: `${PERSIAN_RESPONSES.RAID_CREATED(raid.link, raid.maxPeople)}\n\n${PERSIAN_RESPONSES.PARTICIPANT_LIST(raid.participants)}`,
        reply_markup: {
            inline_keyboard: [[
                { text: "✅ شرکت در رید", callback_data: `join_${raidId}` }
            ]]
        }
    });

    await callAPI('answerCallbackQuery', {
        callback_query_id: callback.id,
        text: PERSIAN_RESPONSES.JOIN_SUCCESS(userTag, raid.participants.length, raid.maxPeople),
        show_alert: true
    });
};

// Main polling loop
setInterval(async () => {
    try {
        const updates = await callAPI('getUpdates', {
            offset: LAST_UPDATE_ID + 1,
            timeout: 30,
            allowed_updates: ['message', 'callback_query']
        });

        if (updates.ok) {
            for (const update of updates.result) {
                LAST_UPDATE_ID = update.update_id;
                
                if (update.message) {
                    // Verify user
                    if (update.message.from.username?.toLowerCase() === TARGET_USER.toLowerCase() && 
                        update.message.text?.startsWith('.raid')) {
                        await handleRaidStart(update.message.chat.id, update.message.from.id);
                    }
                    // Process input
                    else if (userState.has(update.message.from.id)) {
                        await processInput(update.message);
                    }
                }
                else if (update.callback_query) {
                    await handleCallback(update.callback_query);
                }
            }
        }
    } catch (err) {
        console.error('Polling error:', err.message);
    }
}, POLL_INTERVAL);

console.log("🤖 ربات رید برای @zonercm فعال شد!");
