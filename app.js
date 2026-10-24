/* This file is the only site-specific setup. No build step is needed. */
const chatStorageKey = 'chatbot-app:' + window.location.pathname.replace(/index\.html$/, '');
try {
  const connectionKey = chatStorageKey + ':connection';
  const connection = JSON.parse(localStorage.getItem(connectionKey) || 'null');
  if (['gpt-5.5', 'gpt-5.6-sol-openai-compact'].includes(connection?.model) && new URL(connection.endpoint).hostname === 'tianyuai.lol') {
    localStorage.setItem(connectionKey, JSON.stringify({ ...connection, model: 'gpt-5.6-luna' }));
  }
} catch (_) { /* The chatbot handles unavailable browser storage. */ }
window.chatbot = window.Chatbot.mount('#chatbot', {
  storageKey: chatStorageKey,
  saveByDefault: true,
  connectionDefaults: {
    endpoint: 'https://tianyuai.lol/v1/chat/completions',
    protocol: 'chat-completions',
    model: 'gpt-5.6-luna',
  },
  // Configure the endpoint, model and optional API key using the settings panel.
  // Never put a private key in these public files.
});
