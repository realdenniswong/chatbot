/* Controlled API fixtures only; no real keys or paid API calls. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const sessions = [];
  let acceptSession;
  const server = http.createServer(async (request, response) => {
    if (request.url.startsWith('/api/')) {
      let input = '';
      for await (const chunk of request) input += chunk;
      const json = !request.url.endsWith('/stream');
      response.writeHead(request.url.endsWith('/error') ? 400 : 200, { 'Content-Type': json ? 'application/json' : 'text/event-stream' });
      response.flushHeaders();
      const session = { response, body: JSON.parse(input) };
      sessions.push(session);
      acceptSession?.(session);
      acceptSession = null;
      return;
    }
    const file = request.url.split('?')[0].slice(1) || 'index.html';
    if (!['index.html', 'app.js', 'chatbot.js', 'chatbot.css'].includes(file)) return response.writeHead(404).end();
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    response.end(fs.readFileSync(path.join(root, file)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const mount = (options = {}) => page.evaluate(({ url, options }) => {
    chatbot.destroy();
    window.chatbot = Chatbot.mount('#chatbot', { storageKey: 'web-search-test', connectionDefaults: { endpoint: url + '/api/stream', model: 'test-model', protocol: 'responses', webSearch: true }, ...options });
  }, { url, options });
  const send = async (prompt) => {
    const session = new Promise(resolve => { acceptSession = resolve; });
    await page.getByRole('textbox', { name: '輸入訊息' }).fill(prompt);
    await page.getByRole('button', { name: '傳送訊息', exact: true }).click();
    return session;
  };
  const event = data => 'data: ' + JSON.stringify(data) + '\n\n';
  const idle = () => page.waitForFunction(() => !document.querySelector('[data-ref="input"]').disabled);
  const last = () => page.locator('.dc-message--assistant').last();
  const answer = '最新資料已更新。citeturn0search0';
  const annotation = { type: 'url_citation', start_index: '最新資料已更新。'.length, end_index: answer.length, title: 'NASA 最新消息', url: 'https://www.nasa.gov/news/' };
  const message = { type: 'message', content: [{ type: 'output_text', text: answer, annotations: [annotation] }] };
  const search = { type: 'web_search_call', status: 'completed', action: { type: 'search', sources: [
    { url: 'https://www.nasa.gov/news/' }, { url: 'https://science.nasa.gov/', title: 'NASA Science' },
    { url: 'javascript:alert(1)' }, { url: 'https://secret:password@example.test/' }, { url: 'data:text/html,bad' },
  ] } };
  try {
    await page.goto(url);
    assert.equal(await page.getByRole('button', { name: '網頁搜尋', exact: true }).getAttribute('aria-pressed'), 'true');
    await mount();
    let session = await send('請搜尋最新資料');
    assert.deepEqual(session.body.tools, [{ type: 'web_search' }]);
    assert.equal(session.body.tool_choice, 'auto');
    assert.deepEqual(session.body.include, ['web_search_call.action.sources']);
    assert.equal(session.body.store, false);
    session.response.write(event({ type: 'response.output_text.delta', output_index: 0, delta: '我會先搜尋。' }));
    session.response.write(event({ type: 'response.reasoning_summary_text.delta', delta: 'PRIVATE REASONING' }));
    session.response.write(event({ type: 'response.web_search_call.searching', output_index: 2 }));
    await page.waitForFunction(() => document.querySelector('[data-ref="search-progress"]')?.textContent === '正在搜尋網頁…');
    assert.equal(await page.locator('[data-ref="search-progress"]').isVisible(), true, 'search progress stays visible after an introductory message');
    session.response.write(event({ type: 'response.output_item.done', output_index: 2, item: search }));
    session.response.write(event({ type: 'response.output_text.delta', output_index: 4, delta: answer }));
    session.response.write(event({ type: 'response.output_text.annotation.added', output_index: 4, content_index: 0, annotation }));
    await last().locator('.dc-citation').waitFor();
    assert.equal(await last().locator('.dc-citation').getAttribute('href'), annotation.url);
    assert.equal(await page.getByRole('textbox', { name: '輸入訊息' }).isDisabled(), true, 'citations display before completion');
    session.response.write(event({ type: 'response.output_item.done', output_index: 4, item: message }));
    // Relays may omit the final output snapshot; preserve item events and annotations.
    session.response.end(event({ type: 'response.completed', response: { status: 'completed' } }));
    await idle();
    let record = await page.evaluate(() => chatbot.getConversation());
    assert.equal(record.messages.at(-1).content, '我會先搜尋。\n' + answer);
    assert.equal(record.messages.at(-1).citations[0].start, '我會先搜尋。\n'.length + annotation.start_index);
    assert.equal(record.messages.at(-1).sources.length, 2);
    assert.ok(!(await last().innerText()).includes('cite'));
    assert.ok(!(await last().innerText()).includes('PRIVATE REASONING'));
    assert.equal(await page.locator('[data-ref="search-progress"]').isVisible(), false);
    await last().locator('.dc-sources summary').click();
    assert.equal(await last().locator('.dc-sources a').count(), 2);
    assert.equal(await last().locator('.dc-sources a').first().innerText(), 'NASA 最新消息 ↗');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '下載對話', exact: true }).click();
    const exported = fs.readFileSync(await (await download).path(), 'utf8');
    assert.match(exported, /搜尋來源：[\s\S]*https:\/\/www.nasa.gov\/news\//);
    assert.ok(!exported.includes('PRIVATE REASONING'));
    await page.reload();
    await mount();
    assert.equal(await last().locator('.dc-citation').count(), 1, 'citations survive saved history restoration');
    await page.getByRole('button', { name: '網頁搜尋', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '網頁搜尋', exact: true }).getAttribute('aria-pressed'), 'false');
    session = await send('繼續傾偈');
    assert.equal(session.body.tools, undefined);
    assert.equal(session.body.include, undefined);
    assert.equal(session.body.input[1].sources, undefined);
    assert.match(session.body.input[1].content, /https:\/\/www.nasa.gov\/news\//, 'follow-up history includes readable citations');
    assert.ok(!session.body.input[1].content.includes('cite'));
    session.response.end(event({ type: 'response.completed', response: { output: [{ type: 'message', content: [{ type: 'output_text', text: '好。' }] }] } }));
    await idle();
    await page.reload();
    await mount();
    assert.equal(await page.getByRole('button', { name: '網頁搜尋', exact: true }).getAttribute('aria-pressed'), 'false', 'search preference survives reload');

    await mount({ storageKey: 'search-json', endpoint: url + '/api/json', stream: false });
    session = await send('完整回覆搜尋測試');
    assert.equal(session.body.stream, false);
    session.response.end(JSON.stringify({ status: 'completed', output: [search, message] }));
    await idle();
    assert.equal(await last().locator('.dc-citation').count(), 1);
    assert.equal(await last().locator('.dc-sources a').count(), 2);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('.dc-sidebar').waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const box = await page.getByRole('button', { name: '網頁搜尋', exact: true }).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
    }
    await page.screenshot({ path: '/tmp/chatbot-search-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await last().locator('.dc-sources summary').click();
    await page.screenshot({ path: '/tmp/chatbot-search-desktop.png', fullPage: true });

    await mount({ storageKey: 'search-stop' });
    session = await send('停止搜尋測試');
    session.response.write(event({ type: 'response.output_item.done', output_index: 0, item: search }));
    session.response.write(event({ type: 'response.output_text.delta', output_index: 1, delta: answer }));
    session.response.write(event({ type: 'response.output_text.annotation.added', output_index: 1, annotation }));
    await last().locator('.dc-citation').waitFor();
    await page.getByRole('button', { name: '停止回覆', exact: true }).click();
    await idle();
    assert.equal(await last().locator('.dc-sources a').count(), 2, 'stopping retains received sources');
    assert.match(await last().innerText(), /已停止回覆/);

    await mount({ storageKey: 'search-error', endpoint: url + '/api/error' });
    const before = sessions.length;
    session = await send('不支援搜尋測試');
    session.response.end(JSON.stringify({ error: { message: 'Unsupported tool: web_search' } }));
    await idle();
    assert.match(await last().innerText(), /未接受網頁搜尋/);
    assert.equal(sessions.length, before + 1, 'no silent retry without search');
    await mount({ storageKey: 'search-destroy' });
    session = await send('結束元件測試');
    session.response.write(event({ type: 'response.web_search_call.searching', output_index: 0 }));
    await page.locator('[data-ref="search-progress"]').waitFor({ state: 'visible' });
    await page.evaluate(() => chatbot.destroy());
    await page.waitForFunction(() => document.querySelector('#chatbot').childElementCount === 0);
    assert.deepEqual(errors, []);
    console.log('PASS: search tools, progress, multi-message SSE, live citations, source validation/deduplication, JSON, saved sources, exports, follow-up context, toggle persistence, mobile layout, partial stopping and unsupported-tool errors.');
  } finally {
    sessions.forEach(session => session.response.destroy());
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
