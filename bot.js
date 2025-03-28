const axios = require('axios');

// Config
const BOT_TOKEN = '2124491577:SmMBycCEHXV5JzwfS8tKmM71Kmi4zlpcA8IxdFCs';
const POLLING_INTERVAL = 5;
let LAST_UPDATE_ID = 0;

// Storage
const activePolls = new Map();
const userVotes = new Map();
const userStates = new Map();

// Persian Responses
const RESPONSES = {
    CREATE_PROMPT: "📝 لطفاً سؤال نظرسنجی را ارسال کنید:",
    OPTIONS_PROMPT: "🔄 گزینه‌ها را در خطوط جداگانه ارسال کنید (حداقل ۲ گزینه):",
    INVALID_OPTIONS: "⚠️ حداقل ۲ گزینه نیاز است! دوباره ارسال کنید:",
    POLL_CREATED: "✅ نظرسنجی ایجاد شد!",
    VOTE_HEADER: (q) => `📊 ${q}\n\n👇 گزینه مورد نظر را انتخاب کنید:`,
    ALREADY_VOTED: (u) => `@${u} ⚠️ شما قبلاً رأی داده‌اید!`,
    VOTE_RECORDED: (u, o) => `@${u} ✅ رأی شما به "${o}" ثبت شد`,
    RESULTS: (q, r) => 
        `📈 نتایج نهایی:\n"${q}"\n\n` +
        Object.entries(r).map(([o, v]) => `▫️ ${o}: ${v} رأی`).join('\n')
};

// API Helper
const callAPI = async (method, data) => {
    try {
        const res = await axios.post(`https://tapi.bale.ai/bot${BOT_TOKEN}/${method}`, data);
        return res.data.result;
    } catch (err) {
        console.error(`API Error (${method}):`, err.response?.data || err.message);
        return null;
    }
};

// Typing Indicator
const showTyping = async (chatId) => {
    await callAPI('sendChatAction', { 
        chat_id: chatId, 
        action: 'typing' 
    });
};

// Create New Poll
const createPoll = async (chatId, userId) => {
    await showTyping(chatId);
    await callAPI('sendMessage', {
        chat_id: chatId,
        text: RESPONSES.CREATE_PROMPT
    });
    userStates.set(userId, { 
        step: 'awaiting_question',
        chatId,
        data: {} 
    });
};

// Process Messages
const processMessage = async (msg) => {
    const { chat, from, text } = msg;
    const state = userStates.get(from.id);
    if (!state) return;

    await showTyping(chat.id);

    if (state.step === 'awaiting_question') {
        state.data.question = text;
        state.step = 'awaiting_options';
        await callAPI('sendMessage', {
            chat_id: chat.id,
            text: RESPONSES.OPTIONS_PROMPT
        });
    } 
    else if (state.step === 'awaiting_options') {
        const options = text.split('\n').filter(o => o.trim().length > 0);
        
        if (options.length < 2) {
            await callAPI('sendMessage', {
                chat_id: chat.id,
                text: RESPONSES.INVALID_OPTIONS
            });
            return;
        }

        const pollId = `poll_${Date.now()}`;
        const keyboard = {
            inline_keyboard: options.map(opt => [{
                text: `${opt} (0)`, 
                callback_data: `vote_${pollId}_${opt}`
            }])
        };

        const sentMsg = await callAPI('sendMessage', {
            chat_id: chat.id,
            text: RESPONSES.VOTE_HEADER(state.data.question),
            reply_markup: keyboard
        });

        activePolls.set(pollId, {
            question: state.data.question,
            options,
            results: Object.fromEntries(options.map(o => [o, 0])),
            chatId: chat.id,
            messageId: sentMsg.message_id
        });

        userStates.delete(from.id);
    }
};

// Handle Voting
const handleVote = async (callback) => {
    const [_, pollId, option] = callback.data.split('_');
    const poll = activePolls.get(pollId);
    const user = callback.from;
    const userKey = `${pollId}_${user.id}`;

    if (!poll) {
        await callAPI('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: "⚠️ این نظرسنجی منقضی شده است"
        });
        return;
    }

    // Check for duplicate votes
    if (userVotes.has(userKey)) {
        await callAPI('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: RESPONSES.ALREADY_VOTED(user.username || user.first_name),
            show_alert: true
        });
        return;
    }

    // Update vote count
    poll.results[option]++;
    userVotes.set(userKey, true);

    // Update poll message
    await callAPI('editMessageText', {
        chat_id: poll.chatId,
        message_id: poll.messageId,
        text: RESPONSES.VOTE_HEADER(poll.question),
        reply_markup: {
            inline_keyboard: poll.options.map(opt => [{
                text: `${opt} (${poll.results[opt]})`,
                callback_data: `vote_${pollId}_${opt}`
            }])
        }
    });

    // Send vote confirmation
    await callAPI('sendMessage', {
        chat_id: poll.chatId,
        text: RESPONSES.VOTE_RECORDED(user.username || user.first_name, option),
        disable_notification: true
    });

    await callAPI('answerCallbackQuery', {
        callback_query_id: callback.id
    });
};

// Main Polling Loop
const pollUpdates = async () => {
    try {
        const updates = await callAPI('getUpdates', {
            offset: LAST_UPDATE_ID + 1,
            timeout: 30,
            allowed_updates: ['message', 'callback_query']
        });

        if (updates) {
            for (const update of updates) {
                LAST_UPDATE_ID = update.update_id;

                if (update.message?.text === '/create') {
                    await createPoll(update.message.chat.id, update.message.from.id);
                } 
                else if (update.message && userStates.has(update.message.from.id)) {
                    await processMessage(update.message);
                }
                else if (update.callback_query?.data?.startsWith('vote_')) {
                    await handleVote(update.callback_query);
                }
            }
        }
    } catch (err) {
        console.error('Polling error:', err.message);
    } finally {
        setTimeout(pollUpdates, POLLING_INTERVAL);
    }
};

// Start Bot
console.log("🤖 ربات نظرسنجی فعال شد!");
pollUpdates();
