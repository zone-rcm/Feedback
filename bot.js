const axios = require('axios');

// ===== CONFIG ===== //
const BOT_TOKEN = '2124491577:SmMBycCEHXV5JzwfS8tKmM71Kmi4zlpcA8IxdFCs';
const POLLING_INTERVAL = 7; // 300ms polling
let LAST_UPDATE_ID = 0;

// ===== STORAGE ===== //
const activePolls = new Map(); // Format: { pollId: { question, options, results, chatId, messageId } }
const userStates = new Map(); // Format: { userId: { step, data } }
const userVotes = new Map(); // Format: "pollId_userId": true

// ===== PERSIAN RESPONSES ===== //
const RESPONSES = {
    WELCOME: "🤖 ربات نظرسنجی فعال شد!",
    CREATE_PROMPT: "📝 لطفا سوال نظرسنجی را ارسال کنید:",
    OPTIONS_PROMPT: "🅰️🅱️ گزینه‌ها را با Enter جدا کنید (حداقل ۲ گزینه):",
    INVALID_OPTIONS: "⚠️ حداقل به ۲ گزینه نیاز داریم! دوباره ارسال کنید:",
    POLL_CREATED: "✅ نظرسنجی ایجاد شد!",
    VOTE_PROMPT: (q) => `📌 ${q}\n\n👉 انتخاب کنید:`,
    ALREADY_VOTED: (u) => `@${u} 🤦 شما قبلا رای دادید!`,
    VOTE_RECORDED: (u, o) => `@${u} ✔️ رای شما به "${o}" ثبت شد`,
    NO_ACTIVE_POLLS: "⚠️ هیچ نظرسنجی فعالی وجود ندارد",
    SHOW_RESULTS: (q, r) => `📊 نتایج "${q}":\n\n${Object.entries(r).map(([o,v]) => `▫️ ${o}: ${v} رای`).join('\n')}`
};

// ===== API HELPER ===== //
const callAPI = async (method, data) => {
    try {
        const res = await axios.post(`https://tapi.bale.ai/bot${BOT_TOKEN}/${method}`, data);
        return res.data.result;
    } catch (err) {
        console.error(`API Error (${method}):`, err.message);
        return null;
    }
};

// ===== CORE FUNCTIONS ===== //
const showTyping = async (chatId) => {
    await callAPI('sendChatAction', {
        chat_id: chatId,
        action: 'typing'
    });
};

const createNewPoll = async (chatId, userId) => {
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

const processMessage = async (message) => {
    const { chat, from, text } = message;
    const userId = from.id;
    const state = userStates.get(userId);

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
        const options = text.split('\n').filter(o => o.trim());
        
        if (options.length < 2) {
            await callAPI('sendMessage', {
                chat_id: chat.id,
                text: RESPONSES.INVALID_OPTIONS
            });
            return;
        }

        const pollId = `poll_${Date.now()}`;
        const keyboard = {
            inline_keyboard: options.map(opt => [
                { text: opt, callback_data: `vote_${pollId}_${opt}` }
            ])
        };

        const message = await callAPI('sendMessage', {
            chat_id: chat.id,
            text: RESPONSES.VOTE_PROMPT(state.data.question),
            reply_markup: keyboard
        });

        activePolls.set(pollId, {
            question: state.data.question,
            options,
            results: {},
            chatId: chat.id,
            messageId: message.message_id
        });

        userStates.delete(userId);
    }
};

const handleVote = async (callback) => {
    const [_, pollId, option] = callback.data.split('_');
    const poll = activePolls.get(pollId);
    const user = callback.from;
    const userTag = user.username || user.first_name;

    if (!poll) {
        await callAPI('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: "⚠️ این نظرسنجی منقضی شده است"
        });
        return;
    }

    // Check for duplicate votes
    if (userVotes.has(`${pollId}_${user.id}`)) {
        await callAPI('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: RESPONSES.ALREADY_VOTED(userTag)
        });
        return;
    }

    // Record vote
    poll.results[option] = (poll.results[option] || 0) + 1;
    userVotes.set(`${pollId}_${user.id}`, true);

    // Update poll message
    await callAPI('editMessageText', {
        chat_id: poll.chatId,
        message_id: poll.messageId,
        text: RESPONSES.VOTE_PROMPT(poll.question),
        reply_markup: {
            inline_keyboard: poll.options.map(opt => [
                { 
                    text: `${opt} (${poll.results[opt] || 0})`, 
                    callback_data: `vote_${pollId}_${opt}` 
                }
            ])
        }
    });

    // Send vote confirmation (with username mention)
    await callAPI('sendMessage', {
        chat_id: poll.chatId,
        text: RESPONSES.VOTE_RECORDED(userTag, option),
        disable_notification: true
    });

    await callAPI('answerCallbackQuery', {
        callback_query_id: callback.id
    });
};

// ===== MAIN POLLING LOOP ===== //
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

                // Handle messages
                if (update.message) {
                    if (update.message.text === '/create') {
                        await createNewPoll(update.message.chat.id, update.message.from.id);
                    } else if (userStates.has(update.message.from.id)) {
                        await processMessage(update.message);
                    }
                }

                // Handle votes
                if (update.callback_query?.data?.startsWith('vote_')) {
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

// ===== START BOT ===== //
console.log(RESPONSES.WELCOME);
pollUpdates();
