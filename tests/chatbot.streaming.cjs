/* Run with Node.js and Playwright available in NODE_PATH. No production dependencies. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const directory = path.resolve(__dirname, '..');
  const sessions = [];
  let acceptSession;
  const server = http.createServer(async (request, response) => {
    if (request.url.startsWith('/stream/')) {
      let input = '';
      for await (const chunk of request) input += chunk;
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      response.flushHeaders();
      const session = { response, body: JSON.parse(input), closed: false };
      response.on('close', () => { session.closed = true; });
      sessions.push(session);
      acceptSession?.(session);
      acceptSession = null;
      return;
    }
    const name = request.url.split('?')[0].slice(1) || 'index.html';
    if (!['index.html', 'chatbot.js', 'chatbot.css', 'app.js'].includes(name)) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    response.end(fs.readFileSync(path.join(directory, name)));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const mount = (protocol = 'chat-completions') => page.evaluate(({ url, protocol }) => {
    window.chatbot.destroy();
    window.chatbot = Chatbot.mount('#chatbot', { storageKey: 'stream-' + protocol, endpoint: url + '/stream/' + protocol, model: 'test-model', protocol });
  }, { url, protocol });
  const start = async (prompt = 'stream test') => {
    const nextSession = new Promise((resolve) => { acceptSession = resolve; });
    await page.getByRole('textbox', { name: '輸入訊息' }).fill(prompt);
    await page.getByRole('button', { name: '傳送訊息', exact: true }).click();
    await page.getByRole('button', { name: '停止回覆', exact: true }).waitFor({ state: 'visible' });
    return nextSession;
  };
  const event = (value, name = '') => (name ? 'event: ' + name + '\r\n' : '') + 'data: ' + JSON.stringify(value) + '\r\n\r\n';
  const delta = (text) => event({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] });
  const finish = (session) => session.response.end(event({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\r\n\r\n');
  const idle = () => page.waitForFunction(() => !document.querySelector('[data-ref="input"]').disabled);
  const last = () => page.locator('.dc-message--assistant').last();
  try {
    await page.goto(url);
    await mount();
    let session = await start('**user formatting remains literal**');
    assert.equal(session.body.stream, true);
    assert.equal(session.body.messages.length, 1);
    assert.equal(await page.locator('.dc-message--user strong').count(), 0);
    const first = Buffer.from(': keepalive\r\n\r\n' + delta('## 圖片重點\n\n**牌名**：錢幣二\n\n- 靈活應變'));
    const split = first.indexOf(Buffer.from('錢')) + 1;
    session.response.write(first.subarray(0, split));
    session.response.write(first.subarray(split));
    await page.waitForFunction(() => document.querySelector('.dc-message--assistant')?.textContent.includes('靈活應變'));
    assert.equal(await page.getByRole('textbox', { name: '輸入訊息' }).isDisabled(), true, 'partial text is visible before completion');
    assert.equal(await last().locator('h3').innerText(), '圖片重點');
    assert.equal(await last().locator('strong').innerText(), '牌名');
    await page.getByRole('switch', { name: '儲存此對話' }).uncheck();
    session.response.write(delta('\n- **保持平衡**\n\n| 狀態 | 提示 |\n| --- | --- |\n| 正位 | 採取行動 |\n| 逆位 | 調整節奏 |'));
    await page.waitForFunction(() => document.querySelectorAll('.dc-message--assistant td').length === 4);
    finish(session);
    await idle();
    assert.equal(await page.locator('.dc-message--assistant').count(), 1, 'one assistant message is updated, not duplicated');
    assert.equal(await page.evaluate(() => chatbot.getSavedConversations().length), 0, 'opting out during streaming prevents all later saves');
    assert.equal(await page.getByRole('button', { name: '停止回覆' }).isVisible(), false);
    await page.getByRole('switch', { name: '儲存此對話' }).check();
    await page.reload();
    await mount();
    assert.equal(await last().locator('table').count(), 1, 'Markdown persists as text and is formatted again on reload');
    assert.equal(await last().locator('strong').count(), 2);

    await mount();
    session = await start('stop test');
    assert.equal(session.body.messages.length, 3, 'follow-up history contains the completed reply once');
    session.response.write(delta('已收到的部分文字'));
    await page.waitForFunction(() => document.querySelector('.is-streaming')?.textContent.includes('已收到的部分文字'));
    await page.getByRole('button', { name: '停止回覆', exact: true }).click();
    await idle();
    assert.match(await last().innerText(), /已收到的部分文字[\s\S]*已停止回覆/);
    assert.equal((await page.evaluate(() => chatbot.getConversation())).messages.at(-1).status, 'stopped');
    assert.equal((await page.evaluate(() => chatbot.getSavedConversations()))[0].messages.at(-1).status, 'stopped');
    await page.reload();
    await mount();
    assert.match(await last().innerText(), /已收到的部分文字[\s\S]*已停止回覆/, 'stopped partial replies restore with their status');

    session = await start('disconnect test');
    session.response.end(delta('中斷前的內容'));
    await idle();
    assert.match(await last().innerText(), /中斷前的內容[\s\S]*回覆中斷/);
    assert.equal((await page.evaluate(() => chatbot.getConversation())).messages.at(-1).content, '中斷前的內容');

    session = await start('stream error test');
    session.response.end(event({ error: { code: 'model_not_found', message: 'Model not found' } }));
    await idle();
    assert.match(await last().innerText(), /未提供此模型/);

    session = await start('output limit test');
    session.response.write(delta('字'.repeat(17000)));
    await idle();
    assert.equal((await page.evaluate(() => chatbot.getConversation())).messages.at(-1).content.length, 16000);
    assert.match(await last().innerText(), /顯示長度上限/);

    await mount('responses');
    session = await start('responses test');
    assert.equal(session.body.store, false);
    assert.equal(session.body.stream, true);
    session.response.write(event({ type: 'response.created', response: { status: 'in_progress' } }, 'response.created'));
    session.response.write(event({ type: 'response.reasoning_summary_text.delta', delta: 'INTERNAL REASONING' }));
    session.response.write(event({ type: 'response.output_text.delta', delta: '中文 **分段**' }));
    await page.waitForFunction(() => document.querySelector('.is-streaming strong')?.textContent === '分段');
    assert.ok(!(await last().innerText()).includes('INTERNAL REASONING'));
    session.response.end(event({ type: 'response.completed', response: { output: [{ type: 'message', content: [{ type: 'output_text', text: '中文 **分段**，完成。' }] }] } }));
    await idle();
    assert.equal((await page.evaluate(() => chatbot.getConversation())).messages.at(-1).content, '中文 **分段**，完成。');

    session = await start('incomplete response');
    session.response.write(event({ type: 'response.output_text.delta', delta: '部分回覆' }));
    session.response.end(event({ type: 'response.incomplete', response: { status: 'incomplete' } }));
    await idle();
    assert.match(await last().innerText(), /部分回覆[\s\S]*回覆中斷/);

    session = await start('multi-line SSE and malformed event');
    session.response.write('event: response.output_text.delta\ndata: {"type":"response.output_text.delta",\ndata: "delta":"多行事件"}\n\n');
    await page.waitForFunction(() => document.querySelector('.is-streaming')?.textContent.includes('多行事件'));
    session.response.end('data: invalid-json\n\n');
    await idle();
    assert.match(await last().innerText(), /多行事件[\s\S]*回覆中斷/);

    // Markdown supports readable structure while treating raw HTML as text.
    const sample = [
      '# 清晰回覆', '', '段落有 **粗體**、*斜體*、~~刪除~~ 同 `inline code`。', '', '## C#', '',
      '1. 第一點', '   - 子項目', '2. 第二點', '', '> 引用文字', '',
      '```html', '<script>window.xss = true</script>', '```', '',
      '| 項目 | 說明 |', '| :--- | ---: |', '| 第一項 | 很長的內容'.padEnd(240, '字') + ' |', '',
      '[官方文件](https://developers.openai.com/) [bad](javascript:alert(1))', '',
      '<img src=x onerror="window.xss=true">', '<svg onload="window.xss=true"></svg>',
    ].join('\n');
    await page.evaluate((sample) => {
      chatbot.destroy();
      window.chatbot = Chatbot.mount('#chatbot', { storageKey: 'markdown-test', reply: () => ({ reply: sample }) });
    }, sample);
    await page.getByRole('textbox', { name: '輸入訊息' }).fill('顯示格式示範');
    await page.getByRole('button', { name: '傳送訊息' }).click();
    await idle();
    assert.equal(await last().locator('h2').innerText(), '清晰回覆');
    assert.equal(await last().locator('h3').innerText(), 'C#');
    assert.equal(await last().locator('ol > li').count(), 2);
    assert.equal(await last().locator('ol ul > li').count(), 1);
    assert.equal(await last().locator('blockquote').innerText(), '引用文字');
    assert.equal(await last().locator('pre code').innerText(), '<script>window.xss = true</script>');
    assert.equal(await last().locator('a').count(), 1);
    assert.equal(await last().locator('img, script, svg').count(), 0);
    assert.equal(await page.evaluate(() => window.xss), undefined);
    await page.screenshot({ path: '/tmp/chatbot-formatting-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.dc-sidebar').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '/tmp/chatbot-formatting-mobile.png', fullPage: true });
    await page.getByRole('button', { name: '設定 AI', exact: true }).click();
    await page.locator('[name="stream"]').uncheck();
    await page.locator('[name="endpoint"]').fill(url + '/stream/responses');
    await page.locator('[name="model"]').fill('test-model');
    await page.getByRole('button', { name: '套用設定' }).click();
    await page.reload();
    await page.evaluate(() => { chatbot.destroy(); window.chatbot = Chatbot.mount('#chatbot', { storageKey: 'markdown-test' }); });
    await page.getByRole('button', { name: '設定 AI', exact: true }).click();
    assert.equal(await page.locator('[name="stream"]').isChecked(), false, 'streaming preference survives reload');
    assert.deepEqual(errors, []);
    console.log('PASS: incremental SSE, UTF-8, Markdown, both API formats, JSON fallback (main suite), stopping, disconnects, errors, output cap, opt-out while streaming, saved formatting, XSS and mobile layout.');
  } finally {
    for (const session of sessions) session.response.destroy();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
