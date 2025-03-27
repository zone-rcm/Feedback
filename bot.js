const axios = require('axios');

// Configuration
const BOT_TOKEN = '471638936:wlWlUc869YCvTa6ATRuPr7NiMpIRC6j2e1NAkeAn'; // REPLACE WITH YOUR BOT TOKEN
const API_URL = `https://tapi.bale.ai/bot${BOT_TOKEN}`;

// In-memory data storage
const whitelist = ['zonercm']; // REPLACE WITH YOUR TELEGRAM USERNAME
const channels = [];
const posts = [];
const userStates = {};

// Main polling function
let offset = 0;
async function pollUpdates() {
    try {
        const response = await axios.get(`${API_URL}/getUpdates`, {
            params: {
                offset,
                timeout: 30
            }
        });

        if (response.data.ok && response.data.result.length > 0) {
            for (const update of response.data.result) {
                offset = update.update_id + 1;
                await handleUpdate(update);
            }
        }
    } catch (error) {
        console.error('Polling error:', error.message);
    } finally {
        setTimeout(pollUpdates, 1000);
    }
}

// Update handler
async function handleUpdate(update) {
    try {
        if (update.message) {
            await handleMessage(update.message);
        } else if (update.my_chat_member) {
            await handleChatMemberUpdate(update.my_chat_member);
        } else if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
        }
    } catch (error) {
        console.error('Update handling error:', error.message);
    }
}

// Handle when bot is added to channels/groups
async function handleChatMemberUpdate(chatMember) {
    if (chatMember.new_chat_member.status === 'member' || chatMember.new_chat_member.status === 'administrator') {
        const chatId = chatMember.chat.id;
        const chatTitle = chatMember.chat.title;
        const chatType = chatMember.chat.type;
        
        if (!channels.some(c => c.id === chatId)) {
            channels.push({
                id: chatId,
                title: chatTitle,
                type: chatType
            });
            console.log(`Bot added to new ${chatType}: ${chatTitle} (${chatId})`);
        }
    }
}

// Message handler
async function handleMessage(message) {
    const chatId = message.chat.id;
    const username = message.from.username;
    const text = message.text || '';
    const photo = message.photo;

    // Verify user is whitelisted
    if (!whitelist.includes(username)) {
        console.log(`Unauthorized access attempt by ${username}`);
        return await sendMessage(chatId, '🚫 Access denied. You are not whitelisted.');
    }

    // Get or initialize user state
    userStates[username] = userStates[username] || { state: 'idle' };

    // Command handlers
    if (text === '/start') {
        await sendMessage(chatId, '🤖 Welcome to Channel Manager Bot\nSend "پنل" to open control panel');
        userStates[username] = { state: 'idle' };
    } 
    else if (text === 'پنل' && userStates[username].state === 'idle') {
        await showPanel(chatId, username);
    }
    else if (text.startsWith('/adduser ') && username === whitelist[0]) {
        const newUser = text.split(' ')[1].replace('@', '');
        if (!whitelist.includes(newUser)) {
            whitelist.push(newUser);
            await sendMessage(chatId, `✅ @${newUser} added to whitelist`);
        } else {
            await sendMessage(chatId, `ℹ️ @${newUser} is already whitelisted`);
        }
    }
    // State handlers
    else if (userStates[username].state === 'waiting_post_type') {
        await handlePostType(chatId, username, text);
    }
    else if (userStates[username].state === 'waiting_image') {
        await handleImage(chatId, username, message);
    }
    else if (userStates[username].state === 'waiting_text') {
        await handleText(chatId, username, text);
    }
    else if (userStates[username].state === 'waiting_buttons_confirm') {
        await handleButtonsConfirm(chatId, username, text);
    }
    else if (userStates[username].state === 'waiting_button_text') {
        await handleButtonText(chatId, username, text);
    }
    else if (userStates[username].state === 'waiting_button_url') {
        await handleButtonUrl(chatId, username, text);
    }
    else if (userStates[username].state === 'waiting_more_buttons') {
        await handleMoreButtons(chatId, username, text);
    }
    else {
        await sendMessage(chatId, '❌ Unrecognized command. Send "پنل" to open panel.');
    }
}

// Show main panel
async function showPanel(chatId, username) {
    if (channels.length === 0) {
        return await sendMessage(chatId, '❌ No channels available. Add bot to channels first.');
    }

    const buttons = channels.map(channel => ({
        text: channel.title,
        callback_data: `channel_${channel.id}`
    }));

    await sendMessage(chatId, '📋 Select a channel:', {
        inline_keyboard: chunkArray(buttons, 2)
    });
}

// Handle post type selection
async function handlePostType(chatId, username, text) {
    if (text === 'Image' || text === 'Text') {
        userStates[username].postType = text.toLowerCase();
        userStates[username].state = text === 'Image' ? 'waiting_image' : 'waiting_text';
        await sendMessage(chatId, text === 'Image' 
            ? '🖼️ Send image with caption' 
            : '✏️ Send your text post');
    } else {
        await sendMessage(chatId, '❌ Please select "Image" or "Text"');
    }
}

// Handle image post
async function handleImage(chatId, username, message) {
    if (!message.photo) {
        return await sendMessage(chatId, '❌ Please send an image');
    }

    const photo = message.photo[message.photo.length - 1];
    userStates[username].postData = {
        type: 'image',
        file_id: photo.file_id,
        caption: message.caption || ''
    };

    userStates[username].state = 'waiting_buttons_confirm';
    await sendMessage(chatId, '✅ Image received. Add buttons? (yes/no)');
}

// Handle text post
async function handleText(chatId, username, text) {
    if (!text) {
        return await sendMessage(chatId, '❌ Please send text content');
    }

    userStates[username].postData = {
        type: 'text',
        content: text
    };

    userStates[username].state = 'waiting_buttons_confirm';
    await sendMessage(chatId, '✅ Text received. Add buttons? (yes/no)');
}

// Handle buttons confirmation
async function handleButtonsConfirm(chatId, username, text) {
    text = text.toLowerCase();
    if (text === 'yes') {
        userStates[username].state = 'waiting_button_text';
        userStates[username].buttons = [];
        await sendMessage(chatId, '🔘 Enter button text:');
    } else if (text === 'no') {
        await finalizePost(chatId, username);
    } else {
        await sendMessage(chatId, '❌ Please answer "yes" or "no"');
    }
}

// Handle button text input
async function handleButtonText(chatId, username, text) {
    if (!text) {
        return await sendMessage(chatId, '❌ Button text cannot be empty');
    }

    userStates[username].currentButton = { text };
    userStates[username].state = 'waiting_button_url';
    await sendMessage(chatId, '🌐 Enter button URL:');
}

// Handle button URL input
async function handleButtonUrl(chatId, username, text) {
    if (!text.startsWith('http')) {
        return await sendMessage(chatId, '❌ URL must start with http:// or https://');
    }

    userStates[username].currentButton.url = text;
    userStates[username].buttons.push(userStates[username].currentButton);
    userStates[username].state = 'waiting_more_buttons';
    await sendMessage(chatId, '✅ Button added. Add another? (yes/no)');
}

// Handle more buttons confirmation
async function handleMoreButtons(chatId, username, text) {
    text = text.toLowerCase();
    if (text === 'yes') {
        userStates[username].state = 'waiting_button_text';
        await sendMessage(chatId, '🔘 Enter next button text:');
    } else if (text === 'no') {
        await finalizePost(chatId, username);
    } else {
        await sendMessage(chatId, '❌ Please answer "yes" or "no"');
    }
}

// Finalize and send post
async function finalizePost(chatId, username) {
    const state = userStates[username];
    const postData = state.postData;
    
    // Add buttons if any
    if (state.buttons && state.buttons.length > 0) {
        postData.buttons = state.buttons;
    }

    // Save post
    posts.push({
        channelId: state.channelId,
        username,
        data: postData,
        timestamp: new Date().toISOString()
    });

    // Send to channel
    try {
        if (postData.type === 'image') {
            await axios.post(`${API_URL}/sendPhoto`, {
                chat_id: state.channelId,
                photo: postData.file_id,
                caption: postData.caption,
                reply_markup: postData.buttons ? {
                    inline_keyboard: postData.buttons.map(b => [{ text: b.text, url: b.url }])
                } : undefined
            });
        } else {
            await axios.post(`${API_URL}/sendMessage`, {
                chat_id: state.channelId,
                text: postData.content,
                reply_markup: postData.buttons ? {
                    inline_keyboard: postData.buttons.map(b => [{ text: b.text, url: b.url }])
                } : undefined
            });
        }

        await sendMessage(chatId, '✅ Post successfully sent to channel!');
    } catch (error) {
        console.error('Posting error:', error.message);
        await sendMessage(chatId, '❌ Failed to send post. Check bot permissions.');
    }

    // Reset user state
    userStates[username] = { state: 'idle' };
}

// Callback query handler
async function handleCallbackQuery(callbackQuery) {
    const data = callbackQuery.data;
    const username = callbackQuery.from.username;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    // Verify user
    if (!whitelist.includes(username)) {
        return await answerCallbackQuery(callbackQuery.id, '🚫 Access denied');
    }

    // Channel selection
    if (data.startsWith('channel_')) {
        const channelId = data.split('_')[1];
        const channel = channels.find(c => c.id == channelId);

        if (channel) {
            userStates[username] = {
                state: 'waiting_post_type',
                channelId
            };

            await editMessageText(chatId, messageId, `📌 Selected: ${channel.title}\nChoose post type:`, {
                inline_keyboard: [
                    [{ text: '🖼️ Image', callback_data: 'type_image' }],
                    [{ text: '✏️ Text', callback_data: 'type_text' }]
                ]
            });
        }
    }
    // Post type selection
    else if (data === 'type_image') {
        userStates[username].state = 'waiting_image';
        await editMessageText(chatId, messageId, '🖼️ Send image with caption:');
    }
    else if (data === 'type_text') {
        userStates[username].state = 'waiting_text';
        await editMessageText(chatId, messageId, '✏️ Send your text post:');
    }

    await answerCallbackQuery(callbackQuery.id);
}

// Telegram API helpers
async function sendMessage(chatId, text, replyMarkup = null) {
    try {
        await axios.post(`${API_URL}/sendMessage`, {
            chat_id: chatId,
            text,
            reply_markup: replyMarkup,
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error('Message sending error:', error.message);
    }
}

async function editMessageText(chatId, messageId, text, replyMarkup = null) {
    try {
        await axios.post(`${API_URL}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text,
            reply_markup: replyMarkup,
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error('Message editing error:', error.message);
    }
}

async function answerCallbackQuery(callbackQueryId, text = '') {
    try {
        await axios.post(`${API_URL}/answerCallbackQuery`, {
            callback_query_id: callbackQueryId,
            text
        });
    } catch (error) {
        console.error('Callback answer error:', error.message);
    }
}

// Utility function
function chunkArray(arr, size) {
    return arr.length > size 
        ? [arr.slice(0, size), ...chunkArray(arr.slice(size), size)] 
        : [arr];
}

// Start bot
console.log('🤖 Bot starting...');
pollUpdates();
