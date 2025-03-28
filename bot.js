const axios = require('axios');

// ===== CONFIG ===== //
const BOT_TOKEN = '2124491577:SmMBycCEHXV5JzwfS8tKmM71Kmi4zlpcA8IxdFCs';
const POLLING_INTERVAL = 1;
let LAST_UPDATE_ID = 0;

// ===== STORAGE ===== //
const pollsDB = new Map(); // { pollId: {question, options, votes, chatId, messageId} }
const userStates = new Map(); // { userId: {step, data} }

// ===== PERSIAN RESPONSES ===== //
const RESPONSES = {
    WELCOME: "🤖 ربات نظرسنجی فعال شد!",
    CREATE_PROMPT: "📝 سوال نظرسنجی را بنویسید:",
    OPTIONS_PROMPT: "🔄 گزینه‌ها را در خطوط جداگانه وارد کنید (حداقل ۲ گزینه):",
    INVALID_OPTIONS: "⚠️ حداقل ۲ گزینه نیاز است! دوباره ارسال کنید:",
    POLL_CREATED: "✅ نظرسنجی ایجاد شد!",
    VOTE_TEMPLATE: (q, results) => 
        `📊 ${q}\n\n` +
        `👇 برای رأی دادن عدد گزینه را ارسال کنید:\n\n` +
        `${results}\n\n` +
        `✏️ تعداد کل آرا: ${Object.values(results).reduce((a,b) => a + b, 0)}`,
    VOTE_RECEIVED: (u, o) => `@${u} ✔️ رأی شما به "${o}" ثبت شد`,
    DUPLICATE_VOTE: (u) => `@${u} ⚠️ شما قبلاً رأی داده‌اید!`,
    INVALID_VOTE: "⚠️ عدد نامعتبر! لطفاً فقط عدد گزینه را ارسال کنید."
};

// ===== API HELPER ===== //
const callAPI = async (method, data) => {
    try {
        const res = await axios.post(`https://tapi.bale.ai/bot${BOT_TOKEN}/${method}`, data);
        return res.data.result;
    } catch (err) {
        console.error(`API Error (${method}):`, err.response?.data || err.message);
        return null;
    }
};

// ===== CORE FUNCTIONS ===== //
const createPoll = async (chatId, userId) => {
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

const processMessage = async (msg) => {
    const { chat, from, text } = msg;
    const state = userStates.get(from.id);
    
    if (!state) return;

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
        const results = options.reduce((acc, opt) => ({ ...acc, [opt]: 0 }), {});
        
        const message = await callAPI('sendMessage', {
            chat_id: chat.id,
            text: RESPONSES.VOTE_TEMPLATE(
                state.data.question,
                options.map((opt, i) => `${i+1}. ${opt} (${results[opt]})`).join('\n')
            ),
            reply_markup: {
                keyboard: [
                    options.map((_, i) => ({ text: `${i+1}` }))
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });

        pollsDB.set(pollId, {
            question: state.data.question,
            options,
            results,
            chatId: chat.id,
            messageId: message.message_id,
            voters: new Set()
        });

        userStates.delete(from.id);
    }
};

const handleVote = async (msg) => {
    const { chat, from, text } = msg;
    
    // Find active poll in this chat
    const poll = [...pollsDB.values()].find(p => p.chatId === chat.id);
    if (!poll) return;

    const optionIndex = parseInt(text) - 1;
    if (isNaN(optionIndex) {
        await callAPI('sendMessage', {
            chat_id: chat.id,
            text: RESPONSES.INVALID_VOTE
        });
        return;
    }

    const selectedOption = poll.options[optionIndex];
    if (!selectedOption) {
        await callAPI('sendMessage', {
            chat_id: chat.id,
            text: RESPONSES.INVALID_VOTE
        });
        return;
    }

    // Check duplicate vote
    if (poll.voters.has(from.id)) {
        await callAPI('sendMessage', {
            chat_id: chat.id,
            text: RESPONSES.DUPLICATE_VOTE(from.username || from.first_name)
        });
        return;
    }

    // Record vote
    poll.results[selectedOption]++;
    poll.voters.add(from.id);

    // Update poll message
    await callAPI('editMessageText', {
        chat_id: chat.id,
        message_id: poll.messageId,
        text: RESPONSES.VOTE_TEMPLATE(
            poll.question,
            poll.options.map((opt, i) => `${i+1}. ${opt} (${poll.results[opt]})`).join('\n')
        ),
        reply_markup: {
            keyboard: [
                poll.options.map((_, i) => ({ text: `${i+1}` }))
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    });

    // Send confirmation
    await callAPI('sendMessage', {
        chat_id: chat.id,
        text: RESPONSES.VOTE_RECEIVED(from.username || from.first_name, selectedOption)
    });
};

// ===== MAIN LOOP ===== //
const pollUpdates = async () => {
    try {
        const updates = await callAPI('getUpdates', {
            offset: LAST_UPDATE_ID + 1,
            timeout: 30,
            allowed_updates: ['message']
        });

        if (updates) {
            for (const update of updates) {
                LAST_UPDATE_ID = update.update_id;

                if (update.message) {
                    if (update.message.text === '/create') {
                        await createPoll(update.message.chat.id, update.message.from.id);
                    } 
                    else if (userStates.has(update.message.from.id)) {
                        await processMessage(update.message);
                    }
                    else if (/^\d+$/.test(update.message.text)) {
                        await handleVote(update.message);
                    }
                }
            }
        }
    } catch (err) {
        console.error('Polling error:', err.message);
    } finally {
        setTimeout(pollUpdates, POLLING_INTERVAL);
    }
};

// Start bot
console.log(RESPONSES.WELCOME);
pollUpdates();
