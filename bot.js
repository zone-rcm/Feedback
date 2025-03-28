const axios = require('axios');

// Configuration
const BOT_TOKEN = '2124491577:SmMBycCEHXV5JzwfS8tKmM71Kmi4zlpcA8IxdFCs';
const TARGET_USERNAME = 'zonercm'; // Without @
const POLLING_INTERVAL = 150; // 250ms polling for instant responses
let LAST_UPDATE_ID = 0;

// Scheduled messages storage
const scheduledMessages = new Map();
const userStates = new Map();

// Persian texts
const TEXTS = {
    WELCOME: "⏰ <b>ربات برنامه‌ریزی پیام</b>\n\nلطفا مدت زمان تاخیر را انتخاب کنید:",
    CONFIRMATION: "✅ پیام شما برای ارسال در <b>%s</b> تنظیم شد.",
    INVALID_INPUT: "⚠️ لطفا یک عدد معتبر وارد کنید.",
    TIME_PROMPT: "⌛ لطفا تعداد دقیقه را وارد کنید:",
    CANCELLED: "❌ برنامه‌ریزی پیام لغو شد.",
    NO_MESSAGE: "⚠️ لطفا این دستور را در پاسخ به پیامی که می‌خواهید برنامه‌ریزی کنید ارسال کنید."
};

// Time options for inline keyboard
const TIME_OPTIONS = [
    { text: "5 دقیقه", callback_data: "schedule_5" },
    { text: "15 دقیقه", callback_data: "schedule_15" },
    { text: "30 دقیقه", callback_data: "schedule_30" },
    { text: "1 ساعت", callback_data: "schedule_60" },
    { text: "2 ساعت", callback_data: "schedule_120" },
    { text: "زمان دلخواه", callback_data: "schedule_custom" },
    { text: "لغو", callback_data: "schedule_cancel" }
];

// Function to get updates
async function getUpdates() {
    try {
        const response = await axios.get(`https://tapi.bale.ai/bot${BOT_TOKEN}/getUpdates`, {
            params: {
                offset: LAST_UPDATE_ID + 1,
                timeout: 30,
                allowed_updates: ['message', 'callback_query']
            }
        });
        return response.data.result || [];
    } catch (error) {
        console.error('Error getting updates:', error.message);
        return [];
    }
}

// Function to send message
async function sendMessage(chatId, text, options = {}) {
    try {
        await axios.post(`https://tapi.bale.ai/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
            ...options
        });
    } catch (error) {
        console.error('Error sending message:', error.message);
    }
}

// Function to reply to message
async function replyToMessage(chatId, messageId, text, options = {}) {
    try {
        await axios.post(`https://tapi.bale.ai/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: text,
            reply_to_message_id: messageId,
            parse_mode: 'HTML',
            ...options
        });
    } catch (error) {
        console.error('Error replying to message:', error.message);
    }
}

// Function to answer callback query
async function answerCallbackQuery(callbackQueryId, text) {
    try {
        await axios.post(`https://tapi.bale.ai/bot${BOT_TOKEN}/answerCallbackQuery`, {
            callback_query_id: callbackQueryId,
            text: text || " ",
            show_alert: !!text
        });
    } catch (error) {
        console.error('Error answering callback:', error.message);
    }
}

// Function to edit message reply markup
async function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
    try {
        await axios.post(`https://tapi.bale.ai/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: replyMarkup
        });
    } catch (error) {
        console.error('Error editing message markup:', error.message);
    }
}

// Function to show schedule menu with inline keyboard
async function showScheduleMenu(chatId, messageId) {
    const keyboard = {
        inline_keyboard: [
            TIME_OPTIONS.slice(0, 3),
            TIME_OPTIONS.slice(3, 6),
            [TIME_OPTIONS[6]]
        ]
    };

    await replyToMessage(chatId, messageId, TEXTS.WELCOME, {
        reply_markup: keyboard
    });
}

// Function to schedule a message
function scheduleMessage(chatId, messageText, delayMinutes) {
    const delayMs = delayMinutes * 60 * 1000;
    const scheduledTime = new Date(Date.now() + delayMs);
    
    const timer = setTimeout(async () => {
        await sendMessage(chatId, `⏰ پیام زمان‌دار:\n${messageText}`);
        scheduledMessages.delete(chatId);
    }, delayMs);
    
    scheduledMessages.set(chatId, {
        timer,
        scheduledTime
    });
    
    return scheduledTime;
}

// Function to handle schedule command
async function handleScheduleCommand(chatId, messageId, userId, originalMessageId) {
    // Store user state
    userStates.set(userId, {
        chatId,
        originalMessageId,
        waitingForCustomTime: false
    });

    await showScheduleMenu(chatId, messageId);
}

// Function to handle callback queries
async function handleCallbackQuery(callbackQuery, userId) {
    const data = callbackQuery.data;
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const messageId = message.message_id;

    // Only allow the target user to interact
    if (callbackQuery.from.username.toLowerCase() !== TARGET_USERNAME.toLowerCase()) {
        await answerCallbackQuery(callbackQuery.id, "❌ فقط کاربر @zonercm می‌تواند از این گزینه استفاده کند.");
        return;
    }

    if (data.startsWith('schedule_')) {
        const timeOption = data.split('_')[1];
        const userState = userStates.get(userId);

        if (!userState) {
            await answerCallbackQuery(callbackQuery.id, "⚠️ وضعیت کاربر یافت نشد.");
            return;
        }

        if (timeOption === 'cancel') {
            if (scheduledMessages.has(chatId)) {
                clearTimeout(scheduledMessages.get(chatId).timer);
                scheduledMessages.delete(chatId);
            }
            await editMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] });
            await sendMessage(chatId, TEXTS.CANCELLED);
            await answerCallbackQuery(callbackQuery.id);
            return;
        }

        if (timeOption === 'custom') {
            userState.waitingForCustomTime = true;
            userStates.set(userId, userState);
            await sendMessage(chatId, TEXTS.TIME_PROMPT);
            await answerCallbackQuery(callbackQuery.id);
            return;
        }

        const delayMinutes = parseInt(timeOption);
        if (isNaN(delayMinutes)) {
            await answerCallbackQuery(callbackQuery.id, TEXTS.INVALID_INPUT);
            return;
        }

        // Get the original message to schedule
        const updates = await getUpdates();
        const originalMessage = updates.find(u => u.message?.message_id === userState.originalMessageId)?.message;

        if (originalMessage) {
            const scheduledTime = scheduleMessage(chatId, originalMessage.text, delayMinutes);
            const timeText = formatTime(delayMinutes);
            await editMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] });
            await sendMessage(chatId, TEXTS.CONFIRMATION.replace('%s', timeText));
            await answerCallbackQuery(callbackQuery.id);
        } else {
            await answerCallbackQuery(callbackQuery.id, TEXTS.NO_MESSAGE);
        }
    }
}

// Helper function to format time
function formatTime(minutes) {
    if (minutes < 60) return `${minutes} دقیقه دیگر`;
    if (minutes === 60) return "1 ساعت دیگر";
    return `${Math.floor(minutes/60)} ساعت و ${minutes%60} دقیقه دیگر`;
}

// Main polling loop
async function poll() {
    try {
        const updates = await getUpdates();
        
        for (const update of updates) {
            LAST_UPDATE_ID = update.update_id;
            
            // Handle messages
            if (update.message && update.message.text) {
                const message = update.message;
                const username = message.from?.username;
                const userId = message.from?.id;
                
                // Only respond to the target username
                if (username && username.toLowerCase() === TARGET_USERNAME.toLowerCase()) {
                    const text = message.text.trim();
                    
                    if (text.startsWith('.schedule')) {
                        const originalMessageId = message.reply_to_message?.message_id;
                        if (originalMessageId) {
                            await handleScheduleCommand(message.chat.id, message.message_id, userId, originalMessageId);
                        } else {
                            await replyToMessage(message.chat.id, message.message_id, TEXTS.NO_MESSAGE);
                        }
                    }
                    else if (userStates.get(userId)?.waitingForCustomTime) {
                        // Handle custom time input
                        const delayMinutes = parseInt(text);
                        if (!isNaN(delayMinutes) && delayMinutes > 0) {
                            const userState = userStates.get(userId);
                            const updates = await getUpdates();
                            const originalMessage = updates.find(u => u.message?.message_id === userState.originalMessageId)?.message;
                            
                            if (originalMessage) {
                                const scheduledTime = scheduleMessage(message.chat.id, originalMessage.text, delayMinutes);
                                const timeText = formatTime(delayMinutes);
                                await sendMessage(message.chat.id, TEXTS.CONFIRMATION.replace('%s', timeText));
                            } else {
                                await sendMessage(message.chat.id, TEXTS.NO_MESSAGE);
                            }
                        } else {
                            await sendMessage(message.chat.id, TEXTS.INVALID_INPUT);
                        }
                        userStates.delete(userId);
                    }
                }
            }
            
            // Handle callback queries
            if (update.callback_query) {
                const callbackQuery = update.callback_query;
                const userId = callbackQuery.from.id;
                await handleCallbackQuery(callbackQuery, userId);
            }
        }
    } catch (error) {
        console.error('Polling error:', error.message);
    } finally {
        // Continue polling with 250ms interval
        setTimeout(poll, POLLING_INTERVAL);
    }
}

// Start the bot
console.log('⏰ Exclusive scheduler bot is running for @' + TARGET_USERNAME);
poll();
