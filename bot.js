const axios = require('axios');

// Config
const BOT_TOKEN = '2124491577:SmMBycCEHXV5JzwfS8tKmM71Kmi4zlpcA8IxdFCs';
const POLL_INTERVAL = 15; // ms
let LAST_UPDATE_ID = 0;

// Storage
const activePolls = new Map();
const userVotes = new Map();

// Persian responses
const RESPONSES = {
    CREATE_PROMPT: "📝 سوال نظرسنجی را بفرستید:",
    OPTIONS_PROMPT: "🅰️🅱️ گزینه‌ها را با Enter جدا کنید (حداقل ۲ گزینه):",
    INVALID_OPTIONS: "⚠️ حداقل ۲ گزینه نیاز است! دوباره بفرستید:",
    POLL_CREATED: (id) => `📊 نظرسنجی ایجاد شد! (کد: ${id})`,
    VOTE_PROMPT: (question) => `📌 ${question}\n\n👉 انتخاب کنید:`,
    ALREADY_VOTED: (user) => `@${user} 🤦 تو که قبلی رای دادی!`,
    VOTE_RECORDED: (user, option) => `@${user} ✔️ رای تو به "${option}" ثبت شد`,
    NO_POLLS: "⚠️ هیچ نظرسنجی فعالی وجود ندارد",
    POLL_RESULTS: (question, results) => 
        `📊 نتایج "${question}":\n\n` +
        Object.entries(results).map(([opt, votes]) => 
            `▫️ ${opt}: ${votes} رای`).join('\n')
};

// API calls
const callAPI = async (method, data) => {
    try {
        const res = await axios.post(`https://tapi.bale.ai/bot${BOT_TOKEN}/${method}`, data);
        return res.data;
    } catch (err) {
        console.error('API Error:', err.message);
        return { ok: false };
    }
};

// Create poll
const createPoll = async (chatId, userId) => {
    await callAPI('sendMessage', {
        chat_id: chatId,
        text: RESPONSES.CREATE_PROMPT
    });
    userStates.set(userId, { 
        step: 'creating',
        chatId,
        data: {} 
    });
};

// Process votes
const handleVote = async (callback, pollId, option) => {
    const user = callback.from;
    const poll = activePolls.get(pollId);
    
    if (!poll) {
        await callAPI('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: "⚠️ این نظرسنجی منقضی شده"
        });
        return;
    }

    // Check if already voted
    if (userVotes.has(`${pollId}_${user.id}`)) {
        await callAPI('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: RESPONSES.ALREADY_VOTED(user.username || user.first_name)
        });
        return;
    }

    // Record vote
    poll.results[option] = (poll.results[option] || 0) + 1;
    userVotes.set(`${pollId}_${user.id}`, true);

    // Shame them by mentioning
    await callAPI('sendMessage', {
        chat_id: poll.chatId,
        text: RESPONSES.VOTE_RECORDED(
            user.username || user.first_name, 
            option
        ),
        disable_notification: true
    });

    // Update poll
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

    await callAPI('answerCallbackQuery', {
        callback_query_id: callback.id
    });
};

// Main polling loop
const pollUpdates = async () => {
    try {
        const { result } = await callAPI('getUpdates', {
            offset: LAST_UPDATE_ID + 1,
            timeout: 30,
            allowed_updates: ['message', 'callback_query']
        });

        if (result) {
            for (const update of result) {
                LAST_UPDATE_ID = update.update_id;

                // Handle messages
                if (update.message?.text?.startsWith('/create')) {
                    await createPoll(update.message.chat.id, update.message.from.id);
                }

                // Handle votes
                if (update.callback_query?.data?.startsWith('vote_')) {
                    const [_, pollId, option] = update.callback_query.data.split('_');
                    await handleVote(update.callback_query, pollId, option);
                }
            }
        }
    } catch (err) {
        console.error('Polling error:', err.message);
    } finally {
        setTimeout(pollUpdates, POLL_INTERVAL);
    }
};

// Start bot
console.log("🤖 ربات نظرسنجی فعال شد!");
pollUpdates();
