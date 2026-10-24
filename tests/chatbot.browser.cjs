/* Run with Node.js and Playwright available in NODE_PATH. No production dependencies. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const directory = path.resolve(__dirname, '..');
  const server = http.createServer((request, response) => {
    const name = request.url.split('?')[0].replace(/^\/ChatBot\//, '') || 'index.html';
    if (!['index.html', 'chatbot.js', 'chatbot.css', 'app.js'].includes(name)) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    response.end(fs.readFileSync(path.join(directory, name)));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/ChatBot/`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium' }).catch((error) => { server.close(); throw error; });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const serviceRequests = [];
  await context.route('https://chat.example.test/default', async (route) => {
    const body = route.request().postDataJSON();
    serviceRequests.push({ body, authorization: route.request().headers().authorization });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: '自由回覆：' + body.input.at(-1).content }] }] }) });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const records = () => page.evaluate(() => window.chatbot.getSavedConversations());
  const messages = () => page.locator('.dc-message');
  const send = async (text) => {
    await page.getByRole('textbox', { name: '輸入訊息' }).fill(text);
    await page.getByRole('button', { name: '傳送訊息' }).click();
    await page.waitForFunction(() => !document.querySelector('[data-ref="input"]').disabled);
  };
  try {
    await page.goto(url);
    await page.screenshot({ path: '/tmp/chatbot-app-desktop.png', fullPage: true });
    await send('任何話題');
    assert.equal(await page.locator('dialog').isVisible(), true, 'unconfigured chat prompts for connection instead of a canned reply');
    assert.equal(await messages().count(), 0);
    await page.locator('[name="protocol"]').selectOption('responses');
    await page.locator('[name="endpoint"]').fill('https://chat.example.test/default');
    await page.locator('[name="model"]').fill('my-personal-model');
    await page.locator('[name="apiKey"]').fill('private-memory-key');
    await page.getByRole('button', { name: '套用設定' }).click();
    assert.ok(!(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).includes('private-memory-key'));
    await page.getByRole('button', { name: /寫作與表達/ }).click();
    await page.waitForFunction(() => window.chatbot.getConversation().messages.length === 2);
    assert.equal((await records()).length, 1);
    assert.equal(serviceRequests[0].authorization, 'Bearer private-memory-key');
    assert.equal(serviceRequests[0].body.store, false);
    assert.deepEqual(Object.keys(serviceRequests[0].body).sort(), ['input', 'model', 'store', 'stream'], 'no system prompt or topic rules added');
    assert.equal(serviceRequests[0].body.stream, true);
    const firstId = (await records())[0].id;
    await page.reload();
    assert.equal(await messages().count(), 2, 'saved conversation restores after reload');

    for (let i = 0; i < 5; i++) await send('任意訊息 ' + i);
    assert.equal(serviceRequests[1].authorization, undefined, 'API key does not survive reload');
    assert.equal((await records())[0].messages.length, 12, 'full transcript survives beyond eight messages');
    await page.reload();
    assert.equal(await messages().count(), 12);
    await page.getByRole('switch', { name: '儲存此對話' }).uncheck();
    assert.equal((await records()).length, 0, 'turning off deletes persisted transcript');
    assert.equal(await messages().count(), 12, 'turning off retains visible conversation');
    await send('私密對話不要儲存');
    assert.equal((await records()).length, 0, 'future replies do not recreate removed transcript');
    const storedText = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    assert.ok(!storedText.includes('私密對話不要儲存'));
    await page.getByRole('switch', { name: '儲存此對話' }).check();
    assert.equal((await records())[0].messages.length, 14, 're-enabling saves complete visible transcript');
    await page.getByRole('button', { name: '開始新對話' }).click();
    await send('你好');
    assert.equal((await records()).length, 2, 'new chat keeps older saved chats');
    await page.evaluate((id) => window.chatbot.load(id), firstId);
    assert.equal(await messages().count(), 14, 'older conversation can be reopened');
    await page.getByRole('button', { name: /刪除對話：幫我整理/ }).click();
    await send('刪除後不可重新儲存');
    assert.equal((await records()).length, 1);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '下載對話' }).click();
    assert.match((await downloadPromise).suggestedFilename(), /^chatbot-app-.*\.txt$/);
    await page.reload();
    assert.equal(await messages().count(), 0, 'deleted active transcript is not restored');

    // User input and restored transcripts must render as literal text.
    await send('<img src=x onerror="window.xss=true">');
    assert.equal(await page.evaluate(() => window.xss), undefined);
    assert.equal(await page.locator('.dc-message img').count(), 0);
    await page.getByRole('switch', { name: '儲存此對話' }).check();
    await page.reload();
    assert.equal(await page.locator('.dc-message img').count(), 0);

    // Opting out during a pending service reply must also prevent that reply being saved.
    await page.evaluate(() => {
      window.chatbot.destroy();
      window.chatbot = Chatbot.mount('#chatbot', {
        storageKey: 'pending-test', saveByDefault: true,
        reply: () => new Promise((resolve) => { window.finishReply = resolve; }),
      });
      void window.chatbot.send('pending private message');
    });
    await page.getByRole('switch', { name: '儲存此對話' }).uncheck();
    await page.evaluate(() => window.finishReply({ reply: 'private delayed reply' }));
    await page.waitForFunction(() => !document.querySelector('[data-ref="input"]').disabled);
    assert.equal((await records()).length, 0);
    assert.equal(await messages().count(), 2);

    // Changing records in another tab cannot resurrect an opted-out conversation.
    await page.getByRole('switch', { name: '儲存此對話' }).check();
    const other = await context.newPage();
    await other.goto(url);
    await other.evaluate(() => localStorage.removeItem('pending-test:conversation:' + JSON.parse(localStorage.getItem('pending-test:preferences')).activeId));
    await page.waitForFunction(() => !window.chatbot.getConversation().save);
    await other.close();

    // Real service contract: bounded history, no embedded secrets, rejected HTTP responses handled.
    await page.reload();
    const received = [];
    await page.route('https://chat.example.test/api', async (route) => {
      received.push(route.request().postDataJSON());
      const count = received.length;
      const result = count === 3 ? { error: { message: 'No available channel for model example under group plus (distributor)', code: 'model_not_found' } }
        : count === 4 ? { error: { message: 'The requested model was not found', code: 'model_not_found' } }
        : { reply: '服務測試回覆', links: [{ label: 'unsafe', href: 'javascript:alert(1)' }] };
      await route.fulfill({ status: count === 2 || count === 3 ? 503 : count === 4 ? 404 : 200, contentType: 'application/json', body: JSON.stringify(result) });
    });
    await page.evaluate(() => {
      window.chatbot.destroy();
      window.chatbot = Chatbot.mount('#chatbot', { storageKey: 'endpoint-test', protocol: 'custom', endpoint: 'https://chat.example.test/api' });
    });
    await send('endpoint first');
    assert.equal(received[0].message, 'endpoint first');
    assert.deepEqual(received[0].history, []);
    assert.equal(await page.locator('.dc-message-link').count(), 0);
    await send('endpoint second');
    assert.equal(received[1].history.length, 2);
    assert.match(await messages().last().innerText(), /暫時未能連接/);
    await send('channel failure');
    assert.match(await messages().last().innerText(), /沒有此模型的可用渠道/, 'provider routing failures receive a distinct actionable message');
    await send('model failure');
    assert.match(await messages().last().innerText(), /未提供此模型/);

    // A full storage device must show failure, while chat remains usable.
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
    await send('quota failure');
    assert.match(await page.locator('[data-ref="notice"]').innerText(), /未能儲存/);
    assert.equal(await page.getByRole('textbox', { name: '輸入訊息' }).isEnabled(), true);

    const blocked = await browser.newContext();
    await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); });
    const blockedPage = await blocked.newPage();
    await blockedPage.goto(url);
    assert.equal(await blockedPage.getByRole('switch').isDisabled(), true);
    await blockedPage.evaluate(() => {
      window.chatbot.destroy();
      window.chatbot = Chatbot.mount('#chatbot', { reply: ({ message }) => ({ reply: message }) });
    });
    await blockedPage.getByRole('textbox').fill('你好');
    await blockedPage.getByRole('button', { name: '傳送訊息' }).click();
    await blockedPage.waitForFunction(() => document.querySelectorAll('.dc-message').length === 2);
    await blocked.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 });
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(url);
    await mobilePage.screenshot({ path: '/tmp/chatbot-app-mobile.png', fullPage: true });
    await mobilePage.evaluate(() => {
      window.chatbot.destroy();
      window.chatbot = Chatbot.mount('#chatbot', { reply: ({ message }) => ({ reply: message }) });
    });
    await mobilePage.getByRole('button', { name: '開啟聊天記錄' }).click();
    await mobilePage.getByRole('button', { name: '開始新對話' }).waitFor({ state: 'visible' });
    assert.equal(await mobilePage.getByRole('button', { name: '開始新對話' }).isVisible(), true);
    await mobilePage.keyboard.press('Escape');
    await mobilePage.setViewportSize({ width: 320, height: 568 });
    assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'narrow viewport has no horizontal overflow');
    await mobilePage.getByRole('switch').uncheck();
    await mobilePage.getByRole('textbox').fill('手機私密對話');
    await mobilePage.getByRole('button', { name: '傳送訊息' }).click();
    await mobilePage.waitForFunction(() => document.querySelectorAll('.dc-message').length === 2);
    await mobilePage.reload();
    assert.equal(await mobilePage.locator('.dc-message').count(), 0, 'disabled saving survives mobile reload');
    assert.equal(await mobilePage.getByRole('switch').isChecked(), false);
    await mobile.close();

    const visionContext = await browser.newContext();
    const imageRequests = [];
    await visionContext.route('https://chat.example.test/vision', async (route) => {
      const body = route.request().postDataJSON();
      imageRequests.push(body);
      const result = body.messages ? { choices: [{ message: { content: '圖片分析測試回覆' } }] } : { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Responses 圖片測試回覆' }] }] };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
    });
    const visionPage = await visionContext.newPage();
    visionPage.on('pageerror', (error) => errors.push(error.message));
    await visionPage.goto(url);
    const mountVision = () => visionPage.evaluate(() => {
      window.chatbot.destroy();
      window.chatbot = Chatbot.mount('#chatbot', { endpoint: 'https://chat.example.test/vision', model: 'gpt-5.5', protocol: 'chat-completions' });
    });
    await mountVision();
    const sample = Buffer.from(await visionPage.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#e8eee1'; ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = '#667b55'; ctx.fillRect(45, 45, 180, 180);
      ctx.font = '28px sans-serif'; ctx.fillText('Image test', 270, 140);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    const attachment = { name: 'sample.png', mimeType: 'image/png', buffer: sample };
    await visionPage.locator('[data-ref="image-input"]').setInputFiles(attachment);
    await visionPage.locator('[data-ref="image-preview"]').waitFor({ state: 'visible' });
    assert.equal(await visionPage.locator('.dc-message-image').count(), 0, 'attachment stays a draft before sending');
    await visionPage.getByRole('textbox', { name: '輸入訊息' }).fill('請讀取圖片文字');
    await visionPage.screenshot({ path: '/tmp/chatbot-image-preview.png', fullPage: true });
    await visionPage.getByRole('button', { name: '傳送訊息' }).click();
    await visionPage.waitForFunction(() => !document.querySelector('[data-ref="input"]').disabled);
    const imageParts = imageRequests[0].messages[0].content;
    assert.equal(imageParts[0].type, 'text');
    assert.equal(imageParts[0].text, '請讀取圖片文字');
    assert.equal(imageParts[1].type, 'image_url');
    assert.match(imageParts[1].image_url.url, /^data:image\/jpeg;base64,/);
    assert.equal(imageRequests[0].model, 'gpt-5.5');
    assert.equal(imageRequests[0].stream, true);
    assert.equal(await visionPage.locator('.dc-message-image').count(), 1);
    await visionPage.reload();
    assert.equal(await visionPage.locator('.dc-message-image').count(), 1, 'saved image restores after reload');
    await mountVision();
    await visionPage.getByRole('textbox', { name: '輸入訊息' }).fill('再解釋一下同一張圖');
    await visionPage.getByRole('button', { name: '傳送訊息' }).click();
    await visionPage.waitForFunction(() => !document.querySelector('[data-ref="input"]').disabled);
    assert.equal(imageRequests[1].messages[0].content[1].type, 'image_url', 'image is retained in follow-up context');

    await visionPage.getByRole('switch').uncheck();
    assert.equal(await visionPage.evaluate(() => window.chatbot.getSavedConversations().length), 0);
    await visionPage.locator('[data-ref="image-input"]').setInputFiles(attachment);
    await visionPage.locator('[data-ref="image-preview"]').waitFor({ state: 'visible' });
    await visionPage.getByRole('button', { name: '移除圖片' }).click();
    assert.equal(await visionPage.locator('[data-ref="image-preview"]').isVisible(), false);
    await visionPage.locator('[data-ref="image-input"]').setInputFiles(attachment);
    await visionPage.locator('[data-ref="image-preview"]').waitFor({ state: 'visible' });
    await visionPage.getByRole('button', { name: '傳送訊息' }).click();
    await visionPage.waitForFunction(() => !document.querySelector('[data-ref="input"]').disabled);
    assert.equal(imageRequests[2].messages.at(-1).content[0].text, '請分析呢張圖片。', 'image-only input gets a useful default prompt');
    assert.equal(await visionPage.evaluate(() => window.chatbot.getSavedConversations().length), 0);
    assert.ok(!(await visionPage.evaluate(() => JSON.stringify(Object.entries(localStorage)))).includes('data:image/'));
    await visionPage.reload();
    assert.equal(await visionPage.locator('.dc-message-image').count(), 0);

    await visionPage.evaluate(() => {
      window.chatbot.destroy();
      window.chatbot = Chatbot.mount('#chatbot', { endpoint: 'https://chat.example.test/vision', model: 'vision-model', protocol: 'responses' });
    });
    await visionPage.locator('[data-ref="image-input"]').setInputFiles(attachment);
    await visionPage.locator('[data-ref="image-preview"]').waitFor({ state: 'visible' });
    await visionPage.getByRole('button', { name: '傳送訊息' }).click();
    await visionPage.waitForFunction(() => !document.querySelector('[data-ref="input"]').disabled);
    assert.equal(imageRequests[3].input[0].content[0].type, 'input_text');
    assert.equal(imageRequests[3].stream, true);
    assert.equal(imageRequests[3].input[0].content[1].type, 'input_image');
    assert.match(imageRequests[3].input[0].content[1].image_url, /^data:image\/jpeg;base64,/);
    await visionPage.locator('[data-ref="image-input"]').setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg onload="alert(1)"/>') });
    await visionPage.waitForFunction(() => document.querySelector('[data-ref="notice"]').textContent.includes('20 MB'));
    assert.equal(await visionPage.locator('[data-ref="image-preview"]').isVisible(), false, 'unsupported image formats are not sent');
    await visionContext.close();
    assert.deepEqual(errors, []);
    console.log('PASS: saved chats, opt-out, reload, delete, export, XSS, API key privacy, pending replies, tabs, API errors, mobile layout, image preview, compression, both vision API formats, image follow-up context, image saving and invalid uploads.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
