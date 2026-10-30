/* This file is the only site-specific setup. No build step is needed. */
const chatStorageKey = 'chatbot-app:' + window.location.pathname.replace(/index\.html$/, '');
const chatDefaultModel = 'gpt-6.1-sol';
const chatDefaultEndpoint = 'https://tianyuai.lol/v1/responses';
try {
  const connectionKey = chatStorageKey + ':connection';
  const credentialKey = chatStorageKey + ':api-key';
  const connection = JSON.parse(localStorage.getItem(connectionKey) || 'null');
  if (connection && new URL(connection.endpoint).hostname === 'tianyuai.lol') {
    const next = { ...connection };
    if (['gpt-5.5', 'gpt-5.6-sol-openai-compact', 'gpt-5.6-luna'].includes(next.model)) next.model = chatDefaultModel;
    if (next.model === chatDefaultModel && next.protocol === 'chat-completions' && next.endpoint === 'https://tianyuai.lol/v1/chat/completions') {
      next.endpoint = chatDefaultEndpoint;
      next.protocol = 'responses';
    }
    if (JSON.stringify(next) !== JSON.stringify(connection)) {
      // Move an endpoint-bound key only with this known, same-provider upgrade.
      const credentialRaw = localStorage.getItem(credentialKey);
      const credential = JSON.parse(credentialRaw || 'null');
      const moveKey = next.endpoint !== connection.endpoint && credential?.endpoint === connection.endpoint;
      if (moveKey) localStorage.setItem(credentialKey, JSON.stringify({ ...credential, endpoint: next.endpoint }));
      try { localStorage.setItem(connectionKey, JSON.stringify(next)); }
      catch (error) {
        if (moveKey) localStorage.setItem(credentialKey, credentialRaw);
        throw error;
      }
    }
  }
} catch (_) { /* The chatbot handles unavailable browser storage. */ }
window.chatbot = window.Chatbot.mount('#chatbot', {
  storageKey: chatStorageKey,
  saveByDefault: true,
  connectionDefaults: {
    endpoint: chatDefaultEndpoint,
    protocol: 'responses',
    model: chatDefaultModel,
    webSearch: true,
  },
  // Configure the endpoint, model and optional API key using the settings panel.
  // Never put a private key in these public files.
});
