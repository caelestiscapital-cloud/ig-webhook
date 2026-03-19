const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const conversationStore = {};

const SYSTEM_PROMPT = `You are a helpful assistant. Keep replies short and conversational — this is Instagram DM.`;

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  
  try {
    const entry = req.body.entry?.[0];
    const messaging = entry?.messaging?.[0];
    if (!messaging?.message?.text) return;
    
    const senderId = messaging.sender.id;
    const userMessage = messaging.message.text;
    
    if (!conversationStore[senderId]) conversationStore[senderId] = [];
    conversationStore[senderId].push({ role: 'user', content: userMessage });
    
    if (conversationStore[senderId].length > 20) {
      conversationStore[senderId] = conversationStore[senderId].slice(-20);
    }
    
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      temperature: 0.1,
      system: SYSTEM_PROMPT,
      messages: conversationStore[senderId]
    });
    
    const aiReply = response.content[0].text;
    conversationStore[senderId].push({ role: 'assistant', content: aiReply });
    
    await axios.post(
      `https://graph.facebook.com/v21.0/me/messages`,
      {
        recipient: { id: senderId },
        message: { text: aiReply }
      },
      { headers: { Authorization: `Bearer ${IG_ACCESS_TOKEN}` } }
    );
    
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
