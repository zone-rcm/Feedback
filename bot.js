const axios = require('axios');

// Configuration
const BOT_TOKEN = '2124491577:SmMBycCEHXV5JzwfS8tKmM71Kmi4zlpcA8IxdFCs';
const TARGET_USERNAME = 'zonercm'; // Without @
const POLLING_INTERVAL = 250; // Faster 250ms polling
let LAST_UPDATE_ID = 0;

// Scheduled messages storage
const scheduledMessages = new Map();

// Persian menu texts
const MENU_TEXTS = {
    WELCOME: "⏰ ربات برنامه‌ریزی پیام\n\nلطفا مدت زمان تاخیر را انتخاب کنید:",
    OPTIONS: [
        "1. 5 دقیقه دیگر",
        "2. 15 دقیقه دیگر",
        "3. 30 دقیقه دیگر",
        "4. 1 ساعت دیگر",
        "5. 2 ساعت دیگر",
        "6. زمان دلخواه (به دقیقه)"
    ],
    CONFIRMATION: "✅ پیام شما برای ارسال در %s تنظیم شد.",
    INVALID_INPUT: "⚠️ لطفا یک عدد معتبر وارد کنید.",
    TIME_PROMPT: "لطفا تعداد دقیقه را وارد کنید:",
    CANCELLED: "❌ برنامه‌ریزی پیام لغو شد."
};

// Function to get updates
async function getUpdates() {
    try {
        const response = await axios.get(`https://tapi.bale.ai/bot${BOT_TOKEN}/getUpdates`, {
            params: {
                offset: LAST_UPDATE_ID + 1,
                timeout: 30,
                allowed_updates: ['message']
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

// Function to show schedule menu
async function showScheduleMenu(chatId, messageId) {
    const keyboard = {
        reply_markup: {
            keyboard: MENU_TEXTS.OPTIONS.map(option => [option]),
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
    await replyToMessage(chatId, messageId, MENU_TEXTS.WELCOME, keyboard);
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

// Function to cancel scheduled message
function cancelScheduledMessage(chatId) {
    if (scheduledMessages.has(chatId)) {
        clearTimeout(scheduledMessages.get(chatId).timer);
        scheduledMessages.delete(chatId);
        return true;
    }
    return false;
}

// Function to handle schedule command
async function handleScheduleCommand(chatId, messageId, text) {
    const parts = text.split('\n');
    
    if (parts.length === 1) {
        // First step: Show menu
        await showScheduleMenu(chatId, messageId);
    } else {
        // Second step: Process time selection
        const timeInput = parts[1].trim();
        
        // Handle menu options
        let delayMinutes;
        if (timeInput.startsWith('1')) delayMinutes = 5;
        else if (timeInput.startsWith('2')) delayMinutes = 15;
        else if (timeInput.startsWith('3')) delayMinutes = 30;
        else if (timeInput.startsWith('4')) delayMinutes = 60;
        else if (timeInput.startsWith('5')) delayMinutes = 120;
        else if (timeInput.startsWith('6')) {
            await replyToMessage(chatId, messageId, MENU_TEXTS.TIME_PROMPT);
            return;
        } else if (/^\d+$/.test(timeInput)) {
            // Custom time entered
            delayMinutes = parseInt(timeInput);
        } else {
            await replyToMessage(chatId, messageId, MENU_TEXTS.INVALID_INPUT);
            return;
        }
        
        // Get the message to schedule (original message)
        const updates = await getUpdates();
        const originalMessage = updates.find(u => u.message?.message_id === messageId)?.message;
        
        if (originalMessage && originalMessage.reply_to_message) {
            const messageToSchedule = originalMessage.reply_to_message.text;
            const scheduledTime = scheduleMessage(chatId, messageToSchedule, delayMinutes);
            
            const timeText = formatTime(delayMinutes);
            await replyToMessage(chatId, messageId, 
                MENU_TEXTS.CONFIRMATION.replace('%s', timeText));
        } else {
            await replyToMessage(chatId, messageId, 
                "⚠️ لطفا این دستور را در پاسخ به پیامی که می‌خواهید برنامه‌ریزی کنید ارسال کنید.");
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
            
            if (update.message && update.message.text) {
                const message = update.message;
                const username = message.from?.username;
                
                // Only respond to the target username
                if (username && username.toLowerCase() === TARGET_USERNAME.toLowerCase()) {
                    const text = message.text.trim();
                    
                    if (text.startsWith('.schedule')) {
                        await handleScheduleCommand(message.chat.id, message.message_id, text);
                    }
                    else if (text === 'لغو' || text === 'cancel') {
                        if (cancelScheduledMessage(message.chat.id)) {
                            await replyToMessage(message.chat.id, message.message_id, MENU_TEXTS.CANCELLED);
                        }
                    }
                }
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
console.log('⏰ Scheduler bot is running for @' + TARGET_USERNAME);
poll();
