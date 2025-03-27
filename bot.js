const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Bot Configuration
const BOT_TOKEN = '1160037511:UNYPZY1GhLScNYpI1bLIJ77wayIqELOjtT48mbaJ'; // Replace with your bot token
const CHANNEL_ID = 5272323810; // Replace with your channel ID
const WHITELISTED_USERS = ['zonercm', 'id_hormoz']; // Whitelisted usernames

// JSON Files
const FILES_DB = 'files.json';
const TEXTS_DB = 'texts.json';
const USERS_DB = 'users.json';

// Ensure JSON files exist
if (!fs.existsSync(FILES_DB)) fs.writeFileSync(FILES_DB, '{}');
if (!fs.existsSync(TEXTS_DB)) fs.writeFileSync(TEXTS_DB, '{}');
if (!fs.existsSync(USERS_DB)) fs.writeFileSync(USERS_DB, '[]');

// Helper Functions
function saveData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadData(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function getIranDateTime() {
    const options = { timeZone: 'Asia/Tehran', hour12: false };
    const now = new Date();
    const date = now.toLocaleDateString('fa-IR', options);
    const time = now.toLocaleTimeString('fa-IR', options);
    return { date, time };
}

async function isUserInChannel(userId) {
    try {
        const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`, {
            params: { chat_id: CHANNEL_ID, user_id: userId }
        });
        const status = response.data.result.status;
        return ['member', 'administrator', 'creator'].includes(status);
    } catch {
        return false;
    }
}

async function sendMessage(chatId, text, options = {}) {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text,
        ...options
    });
}

async function deleteMessage(chatId, messageId) {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
        chat_id: chatId,
        message_id: messageId
    });
}

// Main Bot Logic
async function handleUpdate(update) {
    const chatId = update.message?.chat.id || update.callback_query?.message.chat.id;
    const userId = update.message?.from.id || update.callback_query?.from.id;
    const username = update.message?.from.username;
    const text = update.message?.text;
    const callbackQuery = update.callback_query;

    if (!username || !WHITELISTED_USERS.includes(username)) {
        await sendMessage(chatId, '❌ شما به این بات دسترسی ندارید.');
        return;
    }

    if (callbackQuery) {
        const action = callbackQuery.data;
        const messageId = callbackQuery.message.message_id;

        if (action === 'check_channel') {
            const isMember = await isUserInChannel(userId);
            if (isMember) {
                await deleteMessage(chatId, messageId);
                await sendMessage(chatId, '✅ عضویت شما تایید شد. می‌توانید ادامه دهید.');
            } else {
                await sendMessage(chatId, '❌ هنوز عضو کانال نشده‌اید.');
            }
        } else if (action.startsWith('upload_file')) {
            await sendMessage(chatId, '📤 لطفاً فایل خود را ارسال کنید.');
            // Save state for next message
            saveData('state.json', { userId, action });
        } else if (action.startsWith('upload_text')) {
            await sendMessage(chatId, '📝 لطفاً متن خود را ارسال کنید.');
            saveData('state.json', { userId, action });
        } else if (action === 'broadcast_text') {
            await sendMessage(chatId, '📢 پیام خود را برای ارسال به همه ارسال کنید.');
            saveData('state.json', { userId, action });
        } else if (action === 'broadcast_image') {
            await sendMessage(chatId, '🖼️ تصویر خود را برای ارسال به همه ارسال کنید.');
            saveData('state.json', { userId, action });
        }
        return;
    }

    const isMember = await isUserInChannel(userId);
    if (!isMember) {
        const keyboard = {
            inline_keyboard: [
                [{ text: '🔗 عضویت در کانال', url: `https://t.me/c/${CHANNEL_ID.replace('-100', '')}` }],
                [{ text: '✅ تایید عضویت', callback_data: 'check_channel' }]
            ]
        };
        await sendMessage(chatId, '❌ برای استفاده از این بات، ابتدا باید در کانال ما عضو شوید.', { reply_markup: keyboard });
        return;
    }

    if (text === 'پنل') {
        const { date, time } = getIranDateTime();
        const greeting = `سلام ${update.message.from.first_name}! 🌟\nامروز: ${date}\nساعت: ${time}`;
        const keyboard = {
            inline_keyboard: [
                [{ text: '📤 آپلود فایل', callback_data: 'upload_file' }],
                [{ text: '📝 آپلود متن', callback_data: 'upload_text' }],
                [{ text: '📢 پیام به همه', callback_data: 'broadcast_text' }],
                [{ text: '🖼️ تصویر به همه', callback_data: 'broadcast_image' }]
            ]
        };
        await sendMessage(chatId, `${greeting}\n\nپنل مدیریتی شما:`, { reply_markup: keyboard });
    } else if (text?.startsWith('/start')) {
        const code = text.split(' ')[1];
        const files = loadData(FILES_DB);
        const texts = loadData(TEXTS_DB);

        if (files[code]) {
            await sendMessage(chatId, 'فایل شما آماده است:', { document: files[code] });
        } else if (texts[code]) {
            await sendMessage(chatId, texts[code]);
        } else {
            await sendMessage(chatId, '❌ کد مورد نظر یافت نشد.');
        }
    } else {
        const state = loadData('state.json');
        if (state.userId === userId && state.action) {
            if (state.action.startsWith('upload_file')) {
                const fileId = update.message.document.file_id;
                const code = Math.random().toString(36).substr(2, 8);
                const files = loadData(FILES_DB);
                files[code] = fileId;
                saveData(FILES_DB, files);
                await sendMessage(chatId, `✅ فایل با موفقیت ذخیره شد.\n/start ${code}`);
            } else if (state.action.startsWith('upload_text')) {
                const code = Math.random().toString(36).substr(2, 8);
                const texts = loadData(TEXTS_DB);
                texts[code] = text;
                saveData(TEXTS_DB, texts);
                await sendMessage(chatId, `✅ متن با موفقیت ذخیره شد.\n/start ${code}`);
            } else if (state.action === 'broadcast_text') {
                const users = loadData(USERS_DB);
                for (const user of users) {
                    await sendMessage(user, text);
                }
                await sendMessage(chatId, '✅ پیام به همه ارسال شد.');
            } else if (state.action === 'broadcast_image') {
                const users = loadData(USERS_DB);
                const fileId = update.message.photo[update.message.photo.length - 1].file_id;
                const caption = update.message.caption || '';
                for (const user of users) {
                    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                        chat_id: user,
                        photo: fileId,
                        caption
                    });
                }
                await sendMessage(chatId, '✅ تصویر به همه ارسال شد.');
            }
            saveData('state.json', {}); // Clear state
        }
    }

    // Save user ID if not already saved
    const users = loadData(USERS_DB);
    if (!users.includes(chatId)) {
        users.push(chatId);
        saveData(USERS_DB, users);
    }
}

// Webhook Listener
const express = require('express');
const app = express();
app.use(express.json());

app.post(`/bot${BOT_TOKEN}`, async (req, res) => {
    await handleUpdate(req.body);
    res.sendStatus(200);
});

app.listen(3000, () => console.log('Bot is running on port 3000'));
