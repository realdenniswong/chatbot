/* Uses dummy credentials only. No production dependencies. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((request, response) => {
    const name = request.url.split('?')[0].replace(/^\/ChatBot\//, '') || 'index.html';
    if (!['index.html', 'app.js', 'chatbot.js', 'chatbot.css'].includes(name)) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    response.end(fs.readFileSync(path.join(root, name)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/ChatBot/`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium' });
  const context = await browser.newContext();
  const requests = [];
  await context.route('https://chat.example.test/**', async route => {
    requests.push({ url: route.request().url(), authorization: route.request().headers().authorization });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: '連線測試成功' }] }] }) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const openSettings = () => page.getByRole('button', { name: '設定 AI', exact: true }).click();
  const apply = () => page.getByRole('button', { name: '套用設定', exact: true }).click();
  const send = async text => {
    await page.getByRole('textbox', { name: '輸入訊息' }).fill(text);
    await page.getByRole('button', { name: '傳送訊息', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-ref="input"]').disabled);
  };
  const storedKey = () => page.evaluate(() => JSON.parse(localStorage.getItem('chatbot-app:/ChatBot/:api-key') || 'null'));
  try {
    await page.goto(url);
    assert.equal(await page.locator('[data-ref="mode"]').innerText(), 'gpt-6.1-sol', 'new connections use the requested default model');
    await openSettings();
    await page.locator('[name="protocol"]').selectOption('responses');
    await page.locator('[name="endpoint"]').fill('https://chat.example.test/key-api');
    await page.locator('[name="model"]').fill('test-model');
    await page.locator('[name="apiKey"]').fill('test-saved-key');
    assert.equal(await page.locator('[name="rememberKey"]').isChecked(), true);
    await apply();
    assert.equal((await storedKey()).apiKey, 'test-saved-key');
    assert.equal((await storedKey()).endpoint, 'https://chat.example.test/key-api');
    await send('第一次測試');
    await page.reload();
    await send('重新整理後測試');
    assert.equal(requests.at(-1).authorization, 'Bearer test-saved-key', 'saved key is restored for requests after reload');
    assert.ok(!(await page.evaluate(() => JSON.stringify(chatbot.getSavedConversations()))).includes('test-saved-key'));
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '下載對話' }).click();
    assert.ok(!fs.readFileSync(await (await download).path(), 'utf8').includes('test-saved-key'), 'exports never include credentials');

    await page.getByRole('switch', { name: '儲存此對話' }).uncheck();
    await page.reload();
    await send('關閉對話儲存後仍可連線');
    assert.equal(requests.at(-1).authorization, 'Bearer test-saved-key');
    assert.equal(await page.evaluate(() => chatbot.getSavedConversations().length), 0, 'chat saving remains independent');
    await page.getByRole('switch', { name: '儲存此對話' }).check();
    const messageCount = await page.locator('.dc-message').count();

    const other = await context.newPage();
    await other.goto(url);
    await openSettings();
    assert.match(await page.locator('[data-ref="key-status"]').innerText(), /已記住/);
    await page.getByRole('button', { name: '清除 key', exact: true }).click();
    assert.equal(await storedKey(), null);
    assert.equal(await page.locator('[name="apiKey"]').inputValue(), '');
    await other.getByRole('button', { name: '設定 AI', exact: true }).click();
    await other.waitForFunction(() => document.querySelector('[name="apiKey"]').value === '');
    await other.close();
    await page.getByRole('button', { name: '關閉設定', exact: true }).click();
    await page.reload();
    assert.equal(await page.locator('.dc-message').count(), messageCount, 'clearing the key retains conversation records');
    await openSettings();
    assert.equal(await page.locator('[name="apiKey"]').inputValue(), '');

    await page.locator('[name="apiKey"]').fill('test-memory-only');
    await page.locator('[name="rememberKey"]').uncheck();
    await apply();
    await send('暫存測試');
    assert.equal(requests.at(-1).authorization, 'Bearer test-memory-only');
    assert.equal(await storedKey(), null);
    await page.reload();
    await openSettings();
    assert.equal(await page.locator('[name="rememberKey"]').isChecked(), false);
    assert.equal(await page.locator('[name="apiKey"]').inputValue(), '');

    await page.locator('[name="apiKey"]').fill('test-endpoint-bound');
    await page.locator('[name="rememberKey"]').check();
    await apply();
    await page.evaluate(() => {
      const key = 'chatbot-app:/ChatBot/:connection';
      const connection = JSON.parse(localStorage.getItem(key));
      connection.endpoint = 'https://chat.example.test/other-api';
      localStorage.setItem(key, JSON.stringify(connection));
    });
    await page.reload();
    await send('不同連線測試');
    assert.equal(requests.at(-1).authorization, undefined, 'stored credential is never restored for another endpoint');
    await openSettings();
    assert.equal(await page.locator('[name="apiKey"]').inputValue(), '');
    await page.getByRole('button', { name: '清除 key', exact: true }).click();

    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.endsWith(':api-key')) throw new DOMException('full', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await page.locator('[name="apiKey"]').fill('test-failed-save');
    await apply();
    assert.match(await page.locator('[data-ref="notice"]').innerText(), /未能記住 API key/);
    await send('儲存失敗時仍可暫用');
    assert.equal(requests.at(-1).authorization, 'Bearer test-failed-save');
    assert.equal(await storedKey(), null);
    await page.reload();
    await openSettings();
    assert.equal(await page.locator('[name="apiKey"]').inputValue(), '');

    await page.locator('[name="apiKey"]').fill('test-clear-error');
    await apply();
    await openSettings();
    await page.evaluate(() => {
      window.originalRemove = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (key) {
        if (key.endsWith(':api-key')) throw new DOMException('blocked', 'SecurityError');
        return window.originalRemove.call(this, key);
      };
    });
    await page.getByRole('button', { name: '清除 key', exact: true }).click();
    assert.match(await page.locator('[data-ref="settings-error"]').innerText(), /未能清除/);
    assert.equal((await storedKey()).apiKey, 'test-clear-error');
    await page.evaluate(() => { Storage.prototype.removeItem = window.originalRemove; });
    await page.getByRole('button', { name: '清除 key', exact: true }).click();
    assert.equal(await storedKey(), null);
    // Upgrading the previous default must preserve keys, chat history and connection choices.
    const historyBeforeMigration = await page.evaluate(() => chatbot.getConversation().messages);
    await context.route('https://tianyuai.lol/v1/responses', async route => {
      requests.push({ body: route.request().postDataJSON(), authorization: route.request().headers().authorization });
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: '模型設定測試成功' }] }] }) });
    });
    await page.evaluate(() => {
      const endpoint = 'https://tianyuai.lol/v1/chat/completions';
      localStorage.setItem('chatbot-app:/ChatBot/:connection', JSON.stringify({ endpoint, model: 'gpt-5.6-luna', protocol: 'chat-completions', stream: false, rememberKey: true }));
      localStorage.setItem('chatbot-app:/ChatBot/:api-key', JSON.stringify({ endpoint, apiKey: 'test-migration-key' }));
    });
    await page.reload();
    assert.equal(await page.locator('[data-ref="mode"]').innerText(), 'gpt-6.1-sol');
    assert.deepEqual(await page.evaluate(() => chatbot.getConversation().messages), historyBeforeMigration);
    await send('模型設定測試');
    assert.equal(requests.at(-1).body.model, 'gpt-6.1-sol');
    assert.equal(requests.at(-1).body.stream, false);
    assert.equal(requests.at(-1).authorization, 'Bearer test-migration-key');
    assert.equal((await storedKey()).apiKey, 'test-migration-key');
    assert.equal((await storedKey()).endpoint, 'https://tianyuai.lol/v1/responses');
    assert.deepEqual(requests.at(-1).body.tools, [{ type: 'web_search' }]);
    assert.equal(requests.at(-1).body.messages, undefined);
    await page.evaluate(() => {
      const key = 'chatbot-app:/ChatBot/:connection';
      const connection = JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify({ ...connection, model: 'my-selected-model' }));
    });
    await page.reload();
    assert.equal(await page.locator('[data-ref="mode"]').innerText(), 'my-selected-model', 'explicit custom models are preserved');
    assert.deepEqual(errors, []);
    console.log('PASS: remembered keys survive reload, memory-only opt-out, independent chat saving, no credentials in transcripts/exports, endpoint binding, clearing across tabs, storage failures, and model migration preserving credentials/history/preferences.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
