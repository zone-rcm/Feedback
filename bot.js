const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const BOT_TOKEN = '1160037511:UNYPZY1GhLScNYpI1bLIJ77wayIqELOjtT48mbaJ';
const CHANNEL_ID = 5272323810; // Numeric channel ID
const API_URL = `https://tapi.bale.ai/bot${BOT_TOKEN}`;
const WHITELIST = ['admin1', 'admin2']; // Whitelisted usernames without @
const POLL_INTERVAL = 3000; // 3 seconds between updates

// Data storage
const USERS_FILE = 'users.json';
const FILES_FILE = 'files.json';
const TEXTS_FILE = 'texts.json';

// Initialize data files if they don't exist
[USERS_FILE, FILES_FILE, TEXTS_FILE].forEach(file => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, '{}');
    }
});

// Helper functions
function getIranDateTime() {
    const now = new Date();
    const options = {
        timeZone: 'Asia/Tehran',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    };
    return new Intl.DateTimeFormat('fa-IR', options).format(now);
}

function loadJSON(file) {
    return JSON.parse(fs.readFileSync(file));
}

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateRandomCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Telegram API wrapper
async function sendMessage(chatId, text, replyMarkup = null) {
    try {
        await axios.post(`${API_URL}/sendMessage`, {
            chat_id: chatId,
            text,
            reply_markup: replyMarkup,
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error('Error sending message:', error.response?.data);
    }
}

async function deleteMessage(chatId, messageId) {
    try {
        await axios.post(`${API_URL}/deleteMessage`, {
            chat_id: chatId,
            message_id: messageId
        });
    } catch (error) {
        console.error('Error deleting message:', error.response?.data);
    }
}

async function getChatMember(chatId, userId) {
    try {
        const response = await axios.post(`${API_URL}/getChatMember`, {
            chat_id: chatId,
            user_id: userId
        });
        return response.data.result.status;
    } catch (error) {
        console.error('Error getting chat member:', error.response?.data);
        return 'left';
    }
}

// Bot logic
async function handleStart(chatId, userId, firstName, messageId = null) {
    const greeting = `سلام ${firstName}! 👋\n\n🕒 تاریخ و زمان ایران: ${getIranDateTime()}`;
    
    // Check channel membership
    const status = await getChatMember(CHANNEL_ID, userId);
    if (status !== 'member' && status !== 'administrator' && status !== 'creator') {
        const joinKeyboard = {
            inline_keyboard: [
                [{ text: 'عضویت در کانال 📢', url: `https://t.me/c/${CHANNEL_ID.toString().replace(/^-100/, '')}` }],
                [{ text: 'بررسی عضویت ♻️', callback_data: `check_membership:${userId}:${messageId}` }]
            ]
        };
        await sendMessage(chatId, `${greeting}\n\n⚠️ لطفا ابتدا در کانال ما عضو شوید!`, joinKeyboard);
        return false;
    }
    
    await sendMessage(chatId, greeting);
    return true;
}

async function handlePanel(chatId, username) {
    if (!WHITELIST.includes(username)) {
        await sendMessage(chatId, '⛔ دسترسی denied!');
        return;
    }

    const panelText = `👑 پنل مدیریت\n\n🕒 تاریخ و زمان ایران: ${getIranDateTime()}`;
    const panelKeyboard = {
        inline_keyboard: [
            [{ text: 'آپلود فایل 📁', callback_data: 'upload_file' }],
            [{ text: 'آپلود متن 📝', callback_data: 'upload_text' }],
            [{ text: 'ارسال پیام به کاربران 📢', callback_data: 'broadcast_text' }],
            [{ text: 'ارسال عکس به کاربران 🖼️', callback_data: 'broadcast_photo' }]
        ]
    };
    
    await sendMessage(chatId, panelText, panelKeyboard);
}

// Handle updates
let lastCommand = {};
let waitingFor = {};
let lastUpdateId = 0;

async function getUpdates() {
    try {
        const response = await axios.get(`${API_URL}/getUpdates`, {
            params: {
                offset: lastUpdateId + 1,
                timeout: 30
            }
        });
        
        if (response.data.ok && response.data.result.length > 0) {
            for (const update of response.data.result) {
                await processUpdate(update);
                lastUpdateId = update.update_id;
            }
        }
    } catch (error) {
        console.error('Error getting updates:', error.message);
    }
    
    setTimeout(getUpdates, POLL_INTERVAL);
}

async function processUpdate(update) {
    if (update.message) {
        const message = update.message;
        const chatId = message.chat.id;
        const userId = message.from.id;
        const username = message.from.username;
        const firstName = message.from.first_name;
        const text = message.text;

        // Handle /start command
        if (text && text.startsWith('/start')) {
            const code = text.split(' ')[1];
            
            if (code) {
                // Check for file or text code
                const files = loadJSON(FILES_FILE);
                const texts = loadJSON(TEXTS_FILE);
                
                if (files[code]) {
                    await axios.post(`${API_URL}/sendDocument`, {
                        chat_id: chatId,
                        document: files[code].file_id,
                        caption: files[code].caption || ''
                    });
                    return;
                }
                
                if (texts[code]) {
                    await sendMessage(chatId, texts[code].content);
                    return;
                }
                
                await sendMessage(chatId, 'کد وارد شده معتبر نیست! ❌');
                return;
            }
            
            // Regular start command
            const isMember = await handleStart(chatId, userId, firstName, message.message_id);
            if (!isMember) {
                lastCommand[userId] = text;
            }
            
            // Save user
            const users = loadJSON(USERS_FILE);
            if (!users[userId]) {
                users[userId] = {
                    username,
                    firstName,
                    date: new Date().toISOString()
                };
                saveJSON(USERS_FILE, users);
            }
        }
        // Handle panel command
        else if (text === 'پنل') {
            const isMember = await handleStart(chatId, userId, firstName);
            if (isMember) {
                await handlePanel(chatId, username);
            } else {
                lastCommand[userId] = text;
            }
        }
        // Handle waiting for file/text
        else if (waitingFor[userId] === 'file' && message.document) {
            const files = loadJSON(FILES_FILE);
            const code = generateRandomCode();
            
            files[code] = {
                file_id: message.document.file_id,
                file_name: message.document.file_name,
                caption: message.caption || '',
                date: new Date().toISOString()
            };
            
            saveJSON(FILES_FILE, files);
            delete waitingFor[userId];
            
            await sendMessage(chatId, `فایل با موفقیت آپلود شد! ✅\n\nلینک دسترسی:\n/start ${code}`);
        }
        else if (waitingFor[userId] === 'text' && text) {
            const texts = loadJSON(TEXTS_FILE);
            const code = generateRandomCode();
            
            texts[code] = {
                content: text,
                date: new Date().toISOString()
            };
            
            saveJSON(TEXTS_FILE, texts);
            delete waitingFor[userId];
            
            await sendMessage(chatId, `متن با موفقیت آپلود شد! ✅\n\nلینک دسترسی:\n/start ${code}`);
        }
        else if (waitingFor[userId] === 'broadcast_text' && text) {
            const users = loadJSON(USERS_FILE);
            let success = 0;
            let failed = 0;
            
            for (const [id, user] of Object.entries(users)) {
                try {
                    await sendMessage(id, text);
                    success++;
                } catch (error) {
                    failed++;
                }
            }
            
            delete waitingFor[userId];
            await sendMessage(chatId, `پیام به ${success} کاربر ارسال شد!\n${failed} ارسال ناموفق.`);
        }
        else if (waitingFor[userId] === 'broadcast_photo' && message.photo) {
            const users = loadJSON(USERS_FILE);
            let success = 0;
            let failed = 0;
            
            // Get the highest quality photo
            const photo = message.photo[message.photo.length - 1];
            const caption = message.caption || '';
            
            for (const [id, user] of Object.entries(users)) {
                try {
                    await axios.post(`${API_URL}/sendPhoto`, {
                        chat_id: id,
                        photo: photo.file_id,
                        caption
                    });
                    success++;
                } catch (error) {
                    failed++;
                }
            }
            
            delete waitingFor[userId];
            await sendMessage(chatId, `عکس به ${success} کاربر ارسال شد!\n${failed} ارسال ناموفق.`);
        }
    }
    else if (update.callback_query) {
        const callback = update.callback_query;
        const chatId = callback.message.chat.id;
        const userId = callback.from.id;
        const username = callback.from.username;
        const data = callback.data;
        const messageId = callback.message.message_id;
        
        // Handle membership check
        if (data.startsWith('check_membership:')) {
            const parts = data.split(':');
            const targetUserId = parts[1];
            const targetMessageId = parts[2];
            
            if (userId.toString() !== targetUserId.toString()) {
                await axios.post(`${API_URL}/answerCallbackQuery`, {
                    callback_query_id: callback.id,
                    text: 'این دکمه برای شما نیست!'
                });
                return;
            }
            
            const status = await getChatMember(CHANNEL_ID, userId);
            if (status !== 'member' && status !== 'administrator' && status !== 'creator') {
                await axios.post(`${API_URL}/answerCallbackQuery`, {
                    callback_query_id: callback.id,
                    text: 'شما هنوز عضو کانال نشده‌اید!'
                });
                return;
            }
            
            await deleteMessage(chatId, targetMessageId);
            await handleStart(chatId, userId, callback.from.first_name);
            
            // Execute previous command if any
            if (lastCommand[userId]) {
                if (lastCommand[userId] === 'پنل') {
                    await handlePanel(chatId, username);
                }
                delete lastCommand[userId];
            }
            
            await axios.post(`${API_URL}/answerCallbackQuery`, {
                callback_query_id: callback.id,
                text: 'عضویت شما تایید شد! ✅'
            });
        }
        // Handle panel buttons
        else if (WHITELIST.includes(username)) {
            if (data === 'upload_file') {
                waitingFor[userId] = 'file';
                await sendMessage(chatId, 'لطفا فایل مورد نظر را ارسال کنید:');
            }
            else if (data === 'upload_text') {
                waitingFor[userId] = 'text';
                await sendMessage(chatId, 'لطفا متن مورد نظر را ارسال کنید:');
            }
            else if (data === 'broadcast_text') {
                waitingFor[userId] = 'broadcast_text';
                await sendMessage(chatId, 'لطفا متن پیام همگانی را ارسال کنید:');
            }
            else if (data === 'broadcast_photo') {
                waitingFor[userId] = 'broadcast_photo';
                await sendMessage(chatId, 'لطفا عکس مورد نظر را ارسال کنید:');
            }
            
            await axios.post(`${API_URL}/answerCallbackQuery`, {
                callback_query_id: callback.id
            });
        }
    }
}

// Start polling
console.log('Bot is running with polling...');
getUpdates();
