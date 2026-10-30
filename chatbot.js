(function (global) {
  'use strict';

  const icons = {
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    trash: '<path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    settings: '<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/>',
    attach: '<path d="m21 11-8 8a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8l8-8"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18Z"/>',
  };
  const svg = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
  const uid = () => global.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  const textNode = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

  // Build a small Markdown subset with DOM nodes. Model output is never HTML.
  function inlineMarkdown(parent, source, depth = 0) {
    if (depth > 8) { parent.append(document.createTextNode(source)); return; }
    const pattern = /\\([\\`*_[\]{}()#+.!|>~-])|(`+)([\s\S]*?)\2(?!`)|\[([^\]\n]+)\]\((<?[^\s)]+>?)\)|(\*\*|__)(?=\S)([\s\S]*?\S)\6|~~(?=\S)([\s\S]*?\S)~~|(\*|_)(?=\S)([^\n]*?\S)\9|\n/g;
    let offset = 0;
    for (const match of source.matchAll(pattern)) {
      parent.append(document.createTextNode(source.slice(offset, match.index)));
      let node;
      if (match[1]) parent.append(document.createTextNode(match[1]));
      else if (match[2]) parent.append(textNode('code', '', match[3].replace(/\n/g, ' ')));
      else if (match[4]) {
        let url;
        try { url = new URL(match[5].replace(/^<|>$/g, ''), location.href); } catch (_) { /* Display invalid links as text. */ }
        if (url && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
          node = document.createElement('a');
          node.href = url.href;
          node.target = '_blank';
          node.rel = 'noopener noreferrer';
          inlineMarkdown(node, match[4], depth + 1);
          parent.append(node);
        } else parent.append(document.createTextNode(match[0]));
      } else if (match[6] || match[8] || match[9]) {
        node = document.createElement(match[6] ? 'strong' : match[8] ? 'del' : 'em');
        inlineMarkdown(node, match[7] || match[8] || match[10], depth + 1);
        parent.append(node);
      } else parent.append(document.createElement('br'));
      offset = match.index + match[0].length;
    }
    parent.append(document.createTextNode(source.slice(offset)));
  }
  function tableCells(line) {
    const cells = [];
    let cell = '', code = false;
    line = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\\' && line[i + 1] === '|') { cell += '|'; i++; }
      else if (line[i] === '`') { code = !code; cell += line[i]; }
      else if (line[i] === '|' && !code) { cells.push(cell.trim()); cell = ''; }
      else cell += line[i];
    }
    cells.push(cell.trim());
    return cells;
  }
  function markdown(source) {
    const fragment = document.createDocumentFragment();
    const listItem = /^( *)([-+*]|\d+[.)])\s+(.*)$/;
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/;
    const rule = /^ {0,3}(?:\*\s*){3,}$|^ {0,3}(?:-\s*){3,}$|^ {0,3}(?:_\s*){3,}$/;
    const tableDivider = (line) => line?.includes('|') && tableCells(line).every((cell) => /^:?-{3,}:?$/.test(cell));
    const blockStart = (lines, i) => fence.test(lines[i]) || /^ {0,3}#{1,6}\s+/.test(lines[i]) || /^ {0,3}>/.test(lines[i]) || listItem.test(lines[i]) || rule.test(lines[i]) || tableDivider(lines[i + 1]);
    function blocks(parent, lines, depth = 0) {
      if (depth > 8) { parent.append(textNode('p', '', lines.join('\n'))); return; }
      for (let i = 0; i < lines.length;) {
        const line = lines[i];
        if (!line.trim()) { i++; continue; }
        const codeStart = line.match(fence);
        const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/);
        const item = line.match(listItem);
        if (codeStart) {
          const codeLines = [];
          i++;
          while (i < lines.length && !new RegExp('^ {0,3}' + codeStart[1][0] + '{' + codeStart[1].length + ',}\\s*$').test(lines[i])) codeLines.push(lines[i++]);
          if (i < lines.length) i++;
          const wrapper = textNode('div', 'dc-code-block', '');
          const language = codeStart[2].trim().split(/\s/)[0].slice(0, 32);
          if (language) wrapper.append(textNode('div', 'dc-code-language', language));
          const pre = document.createElement('pre');
          pre.append(textNode('code', '', codeLines.join('\n')));
          wrapper.append(pre);
          parent.append(wrapper);
        } else if (heading) {
          const node = document.createElement('h' + Math.min(6, heading[1].length + 1));
          inlineMarkdown(node, heading[2].replace(/[ \t]+#+[ \t]*$/, ''));
          parent.append(node);
          i++;
        } else if (rule.test(line)) { parent.append(document.createElement('hr')); i++; }
        else if (/^ {0,3}>/.test(line)) {
          const quoted = [];
          while (i < lines.length && /^ {0,3}>/.test(lines[i])) quoted.push(lines[i++].replace(/^ {0,3}> ?/, ''));
          const quote = document.createElement('blockquote');
          blocks(quote, quoted, depth + 1);
          parent.append(quote);
        } else if (item) {
          const ordered = /^\d/.test(item[2]);
          const list = document.createElement(ordered ? 'ol' : 'ul');
          if (ordered) list.start = Math.max(1, Math.min(999999, parseInt(item[2], 10)));
          const indent = item[1].length;
          while (i < lines.length) {
            const next = lines[i].match(listItem);
            if (!next || next[1].length !== indent || /^\d/.test(next[2]) !== ordered) break;
            const contentIndent = next[0].length - next[3].length;
            const content = [next[3]];
            i++;
            while (i < lines.length) {
              const following = lines[i].match(listItem);
              if (following && following[1].length <= indent) break;
              if (lines[i].trim() && lines[i].search(/\S/) < contentIndent) break;
              if (!lines[i].trim() && lines[i + 1]?.trim() && lines[i + 1].search(/\S/) <= indent) break;
              content.push(lines[i++].slice(contentIndent));
            }
            const li = document.createElement('li');
            blocks(li, content, depth + 1);
            list.append(li);
            if (!lines[i]?.trim()) break;
          }
          parent.append(list);
        } else if (tableDivider(lines[i + 1])) {
          const headers = tableCells(line);
          const alignment = tableCells(lines[i + 1]).map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left');
          const wrapper = textNode('div', 'dc-table-wrap', '');
          wrapper.tabIndex = 0;
          wrapper.setAttribute('role', 'region');
          wrapper.setAttribute('aria-label', '表格，可左右捲動');
          const table = document.createElement('table');
          const head = table.createTHead();
          const addRow = (section, cells, tag) => {
            const row = section.insertRow();
            headers.forEach((_, column) => {
              const cell = document.createElement(tag);
              if (tag === 'th') cell.scope = 'col';
              cell.style.textAlign = alignment[column] || 'left';
              inlineMarkdown(cell, cells[column] || '');
              row.append(cell);
            });
          };
          addRow(head, headers, 'th');
          const body = table.createTBody();
          i += 2;
          while (i < lines.length && lines[i].trim() && lines[i].includes('|')) addRow(body, tableCells(lines[i++]), 'td');
          wrapper.append(table);
          parent.append(wrapper);
        } else {
          const paragraph = [lines[i++]];
          while (i < lines.length && lines[i].trim() && !blockStart(lines, i)) paragraph.push(lines[i++]);
          const node = document.createElement('p');
          inlineMarkdown(node, paragraph.join('\n'));
          parent.append(node);
        }
      }
    }
    blocks(fragment, String(source).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'));
    return fragment;
  }

  function replyText(data, protocol) {
    return protocol === 'responses'
      ? (Array.isArray(data.output) ? data.output : []).filter((item) => item.type === 'message').flatMap((item) => item.content || []).map((part) => part.type === 'output_text' ? part.text : part.type === 'refusal' ? part.refusal : '').join('\n')
      : data.choices?.[0]?.message?.content;
  }
  function safeSources(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).slice(0, 200).flatMap((source) => {
      if (!isRecord(source) || typeof source.url !== 'string') return [];
      try {
        const url = new URL(source.url);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || seen.has(url.href)) return [];
        seen.add(url.href);
        return [{ url: url.href, title: typeof source.title === 'string' && source.title.trim() ? source.title.slice(0, 180) : url.hostname }];
      } catch (_) { return []; }
    }).slice(0, 30);
  }
  function safeCitations(value, length = 16000) {
    return (Array.isArray(value) ? value : []).slice(0, 100).flatMap((citation) => {
      const source = safeSources([citation])[0];
      if (!source || !Number.isInteger(citation.start) || !Number.isInteger(citation.end) || citation.start < 0 || citation.end < citation.start || citation.end > length) return [];
      return [{ ...source, start: citation.start, end: citation.end }];
    });
  }
  function responseResult(data) {
    let reply = '';
    const citations = [], sources = [];
    for (const item of Array.isArray(data.output) ? data.output : []) {
      if (item?.type === 'message') {
        for (const part of item.content || []) {
          const text = part?.type === 'output_text' ? part.text : part?.type === 'refusal' ? part.refusal : '';
          if (typeof text !== 'string' || !text) continue;
          const offset = reply.length + (reply ? 1 : 0);
          if (reply) reply += '\n';
          reply += text;
          for (const annotation of Array.isArray(part.annotations) ? part.annotations : []) {
            if (annotation?.type === 'url_citation') {
              sources.push({ url: annotation.url, title: annotation.title });
              if (Number.isInteger(annotation.start_index) && Number.isInteger(annotation.end_index)) citations.push({ url: annotation.url, title: annotation.title, start: offset + annotation.start_index, end: offset + annotation.end_index });
            }
          }
        }
      } else if (item?.type === 'web_search_call') {
        if (Array.isArray(item.action?.sources)) sources.push(...item.action.sources);
        if (item.action?.type === 'open_page') sources.push({ url: item.action.url });
      }
    }
    const safe = safeCitations(citations, reply.length);
    return { reply, citations: safe, sources: safeSources([...safe, ...sources]) };
  }
  function citedText(message) {
    const citations = safeCitations(message.citations, message.content.length).sort((a, b) => a.start - b.start || a.end - b.end);
    const urls = [...new Set(citations.map((citation) => citation.url))];
    let text = '', offset = 0;
    for (let i = 0; i < citations.length;) {
      const citation = citations[i++], group = [citation];
      while (i < citations.length && citations[i].start === citation.start && citations[i].end === citation.end) group.push(citations[i++]);
      if (citation.start < offset) continue;
      text += message.content.slice(offset, citation.start);
      const quoted = message.content.slice(citation.start, citation.end);
      if (!quoted.includes('\uE200')) text += quoted;
      const unique = [...new Set(group.map((entry) => entry.url))];
      text += ' ' + unique.map((url) => '[〔' + (urls.indexOf(url) + 1) + '〕](' + url.replace(/[()]/g, (char) => char === '(' ? '%28' : '%29') + ')').join(' ');
      offset = citation.end;
    }
    return (text + message.content.slice(offset)).replace(/\uE200cite\uE202[^\uE201]*\uE201/g, '');
  }
  function assistantContent(message) {
    const fragment = markdown(citedText(message));
    const citations = safeCitations(message.citations, message.content.length);
    fragment.querySelectorAll('a').forEach((anchor) => {
      if (/^〔\d+〕$/.test(anchor.textContent)) {
        anchor.className = 'dc-citation';
        anchor.title = citations.find((citation) => citation.url === anchor.href)?.title || '查看來源';
      }
    });
    return fragment;
  }
  function serviceError(data, status) {
    const error = new Error('request_failed');
    error.status = status;
    const detail = data?.error || data;
    const message = typeof detail === 'string' ? detail : typeof detail?.message === 'string' ? detail.message : '';
    if (/no available channel|無可用管道|无可用渠道|distributor/i.test(message)) error.kind = 'channel_unavailable';
    else if (detail?.code === 'model_not_found' || /model.*not.*found|模型不存在|模型已下[线線]/i.test(message)) error.kind = 'model_unavailable';
    else if (/web_search|web search|tools/i.test(message) && /unsupported|not supported|not available|invalid|unknown/i.test(message)) error.kind = 'search_unavailable';
    return error;
  }
  async function streamReply(response, protocol, onDelta, onProgress) {
    if (!response.body) throw new Error('empty_stream');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', dataLines = [], eventName = '', eventSize = 0;
    let reply = '', ended = false, terminal = false, status;
    const outputItems = new Map();
    let web = { sources: [], citations: [] };
    function publish(text, replace = false) {
      reply = (replace ? text : reply + text).slice(0, 16000);
      onDelta(reply);
      if (reply.length >= 16000) { status = 'limit'; ended = true; }
    }
    function refreshResponse() {
      const result = responseResult({ output: [...outputItems].sort((a, b) => a[0] - b[0]).map(([, item]) => item) });
      web = { sources: result.sources, citations: result.citations };
      if (result.reply && result.reply !== reply) publish(result.reply, true);
      onProgress(web);
    }
    function dispatch() {
      const source = dataLines.join('\n');
      const name = eventName;
      dataLines = []; eventName = ''; eventSize = 0;
      if (!source.trim()) return;
      if (source.trim() === '[DONE]') { ended = terminal = true; return; }
      let data;
      try { data = JSON.parse(source); } catch (_) { throw new Error('invalid_stream'); }
      if (data.error || data.type === 'error' || name === 'error') throw serviceError(data, response.status);
      if (protocol === 'chat-completions') {
        const choice = data.choices?.find((item) => item.index === 0 || item.index === undefined);
        const delta = choice?.delta;
        if (delta?.reasoning_content || delta?.reasoning) onProgress({ stage: 'processing' });
        if (typeof delta?.content === 'string') publish(delta.content);
        if (typeof delta?.refusal === 'string') publish(delta.refusal);
        if (choice?.finish_reason) {
          // A completion marker is sufficient; some relays leave the HTTP stream open.
          ended = terminal = true;
          if (choice.finish_reason !== 'stop' && status !== 'limit') status = 'incomplete';
        }
      } else {
        const type = data.type || name;
        if (typeof type === 'string' && type.startsWith('response.reasoning')) onProgress({ stage: 'processing' });
        if (['response.web_search_call.in_progress', 'response.web_search_call.searching'].includes(type)) onProgress({ stage: 'searching' });
        if (type === 'response.web_search_call.completed') onProgress({ stage: 'search-done' });
        const index = Number.isInteger(data.output_index) && data.output_index >= 0 && data.output_index <= 1000 ? data.output_index : 0;
        if (['response.output_item.added', 'response.output_item.done'].includes(type) && ['message', 'web_search_call'].includes(data.item?.type)) {
          outputItems.set(index, data.item);
          if (data.item.type === 'web_search_call') onProgress({ stage: data.item.status === 'completed' ? 'search-done' : 'searching' });
          refreshResponse();
        }
        if (['response.output_text.delta', 'response.refusal.delta', 'response.output_text.annotation.added', 'response.content_part.done'].includes(type)) {
          const item = outputItems.get(index) || { type: 'message', content: [] };
          if (item.type === 'message') {
            const partIndex = Number.isInteger(data.content_index) && data.content_index >= 0 && data.content_index <= 100 ? data.content_index : 0;
            const part = item.content[partIndex] || { type: type === 'response.refusal.delta' ? 'refusal' : 'output_text', text: '', annotations: [] };
            if (typeof data.delta === 'string') {
              const field = type === 'response.refusal.delta' ? 'refusal' : 'text';
              part[field] = (part[field] || '') + data.delta;
            }
            if (type === 'response.output_text.annotation.added' && data.annotation && (part.annotations?.length || 0) < 100) part.annotations = [...(part.annotations || []), data.annotation];
            item.content[partIndex] = type === 'response.content_part.done' && data.part ? data.part : part;
            outputItems.set(index, item);
            refreshResponse();
          }
        }
        if (type === 'response.failed') throw serviceError(data.response?.error || data, response.status);
        if (type === 'response.completed' || type === 'response.incomplete') {
          if (data.response?.output?.length) {
            outputItems.clear();
            data.response.output.forEach((item, i) => { if (['message', 'web_search_call'].includes(item?.type)) outputItems.set(i, item); });
            refreshResponse();
          }
          if (type === 'response.incomplete' && status !== 'limit') status = 'incomplete';
          ended = terminal = true;
        }
      }
    }
    function line(value) {
      if (!value) { dispatch(); return; }
      if (value.startsWith(':')) return;
      const separator = value.indexOf(':');
      const field = separator < 0 ? value : value.slice(0, separator);
      const content = separator < 0 ? '' : value.slice(separator + 1).replace(/^ /, '');
      if (field === 'data') { dataLines.push(content); eventSize += content.length; }
      else if (field === 'event') eventName = content;
      if (eventSize > 1000000) throw new Error('invalid_stream');
    }
    function consume(flush = false) {
      let start = 0;
      for (let i = 0; i < buffer.length && !ended; i++) {
        if (buffer[i] !== '\n' && buffer[i] !== '\r') continue;
        if (buffer[i] === '\r' && i === buffer.length - 1 && !flush) break;
        line(buffer.slice(start, i));
        if (buffer[i] === '\r' && buffer[i + 1] === '\n') i++;
        start = i + 1;
      }
      buffer = buffer.slice(start);
      if (buffer.length > 1000000) throw new Error('invalid_stream');
      if (flush && !ended) { if (buffer) line(buffer); buffer = ''; dispatch(); }
    }
    try {
      while (!ended) {
        const chunk = await reader.read();
        if (chunk.value?.length) onProgress({ chunk: true });
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        consume(chunk.done);
        if (chunk.done) break;
      }
      if (!ended && !terminal) throw new Error('interrupted_stream');
      return { reply, ...web, ...(status ? { status } : {}) };
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  function safeDelivery(value) {
    if (!isRecord(value) || !['stream', 'complete'].includes(value.mode) || !Number.isFinite(value.totalMs) || value.totalMs < 0 || value.totalMs > 1e12) return null;
    const firstTextMs = Number.isFinite(value.firstTextMs) && value.firstTextMs >= 0 ? Math.min(value.firstTextMs, value.totalMs) : null;
    return { mode: value.mode, firstTextMs, totalMs: value.totalMs, chunks: Number.isFinite(value.chunks) ? Math.max(0, Math.min(1000000, Math.floor(value.chunks))) : 0 };
  }

  function mount(target, options = {}) {
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) throw new Error('找不到 chatbot 容器。');
    if (root.chatbotInstance) return root.chatbotInstance;
    const config = { storageKey: 'chatbot-app:' + location.pathname, saveByDefault: true, endpoint: '', model: '', apiKey: '', rememberKey: true, protocol: 'responses', stream: true, webSearch: false, ...options.connectionDefaults, ...options };
    const prefix = config.storageKey + ':conversation:';
    const metaKey = config.storageKey + ':preferences';
    const connectionKey = config.storageKey + ':connection';
    const credentialKey = config.storageKey + ':api-key';
    const instanceId = 'dc-' + uid();
    const abortEvents = new AbortController();
    let requestController = null;
    let storage = null;
    let storageError = '';
    let busy = false;
    let destroyed = false;
    let active;
    let selectedImage = null;
    let defaultSave = config.saveByDefault;

    root.classList.add('chatbot-app');
    root.innerHTML = `
      <aside class="dc-sidebar" aria-label="聊天記錄" id="${instanceId}-history">
        <div class="dc-brand"><span class="dc-brand-mark">${svg('chat')}</span><div><strong>Chat</strong><span>AI ASSISTANT</span></div><button class="dc-icon-button dc-mobile-close" data-action="close-history" aria-label="關閉聊天記錄">${svg('close')}</button></div>
        <button class="dc-new-chat" data-action="new">${svg('plus')}<span>開始新對話</span><span class="dc-key">＋</span></button>
        <div class="dc-history-heading"><span>已儲存的對話</span><span data-ref="count">0</span></div>
        <div class="dc-history-list" data-ref="history"></div>
        <div class="dc-local-note">${svg('shield')}<div><strong>只留在這個裝置</strong><p>聊天記錄儲存於此瀏覽器。<br>你可以隨時關閉儲存或刪除。</p></div></div>
        <button class="dc-sidebar-link" data-action="settings">${svg('settings')}<span>AI 連線設定</span></button>
      </aside>
      <button class="dc-scrim" data-action="close-history" aria-label="關閉聊天記錄" tabindex="-1"></button>
      <section class="dc-main" aria-label="AI 助手">
        <header class="dc-topbar">
          <div class="dc-topbar-title"><button class="dc-icon-button dc-menu" data-action="history" aria-label="開啟聊天記錄" aria-controls="${instanceId}-history" aria-expanded="false">${svg('menu')}</button><span class="dc-status-dot"></span><div><strong>AI 助手</strong><span data-ref="mode">設定 AI 後開始聊天</span></div></div>
          <label class="dc-save-toggle" title="關閉會刪除此對話的已存副本，畫面內對話仍可繼續。"><span>儲存此對話</span><input type="checkbox" role="switch" data-ref="save" aria-describedby="${instanceId}-save-description"><span class="dc-switch" aria-hidden="true"></span></label>
        </header>
        <div class="dc-save-description" id="${instanceId}-save-description" data-ref="save-description"></div>
        <div class="dc-thread" data-ref="thread">
          <div class="dc-welcome" data-ref="welcome">
            <div class="dc-eyebrow"><span></span> A LITTLE SPACE FOR YOUR THOUGHTS</div>
            <div class="dc-welcome-mark">${svg('chat')}</div>
            <h1>你好，有咩可以幫到你？</h1>
            <p>一個想法、一個問題，<br class="dc-mobile-break">或者只係想傾吓偈。</p>
            <div class="dc-suggestions">
              <button data-question="幫我整理一下想法，我會先講講而家諗緊嘅事。"><span class="dc-suggestion-symbol">✎</span><strong>寫作與表達</strong><span>將腦海中嘅想法寫出嚟</span><b>↗</b></button>
              <button data-question="我想學一樣新嘢，可以先問我對咩有興趣嗎？"><span class="dc-suggestion-symbol">◇</span><strong>學啲新嘢</strong><span>由好奇開始，慢慢了解</span><b>↗</b></button>
              <button data-question="幫我規劃今日要做嘅事，先問我有咩待辦事項。"><span class="dc-suggestion-symbol">☷</span><strong>整理計劃</strong><span>計劃、清單，同下一步</span><b>↗</b></button>
              <button data-question="你好，我想隨意傾吓偈。"><span class="dc-suggestion-symbol">◌</span><strong>隨意傾吓</strong><span>咩話題都可以由呢度開始</span><b>↗</b></button>
            </div>
          </div>
          <div class="dc-messages" data-ref="messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="對話訊息"></div>
          <div class="dc-search-progress" data-ref="search-progress" role="status" hidden></div>
        </div>
        <footer class="dc-composer-area">
          <div class="dc-thread-actions"><div class="dc-composer-options"><span data-ref="record-status"></span><button type="button" class="dc-search-toggle" data-action="search" aria-pressed="false">${svg('globe')}網頁搜尋</button></div><button data-action="export" class="dc-export">${svg('download')}下載對話</button></div>
          <div class="dc-image-preview" data-ref="image-preview" hidden><img data-ref="image-preview-img" alt="待傳送圖片預覽"><div><strong data-ref="image-name"></strong><span>傳送後交由模型分析 · 已自動調整圖片大小</span></div><button type="button" class="dc-icon-button" data-action="remove-image" aria-label="移除圖片">${svg('close')}</button></div>
          <form class="dc-composer" data-ref="form">
            <input data-ref="image-input" class="dc-sr-only" type="file" accept="image/jpeg,image/png,image/webp" tabindex="-1" aria-label="選擇圖片">
            <button type="button" class="dc-attach dc-icon-button" data-action="attach" aria-label="上載圖片" title="上載 JPG、PNG 或 WebP 圖片">${svg('attach')}</button>
            <label class="dc-sr-only" for="${instanceId}-input">輸入訊息</label>
            <textarea id="${instanceId}-input" data-ref="input" placeholder="輸入問題，隨時問我…" rows="1" maxlength="4000" enterkeyhint="enter"></textarea>
            <button type="submit" class="dc-send" aria-label="傳送訊息">${svg('arrow')}</button>
            <button type="button" class="dc-send dc-stop" data-ref="stop" data-action="stop" aria-label="停止回覆" title="停止回覆" hidden>${svg('stop')}</button>
          </form>
          <p class="dc-disclaimer"><span class="dc-desktop-key-hint">Enter 傳送 · Shift + Enter 換行</span><span class="dc-phone-key-hint">Return 換行 · 撳按鈕傳送</span> · 圖片分析需模型支援 <button data-action="settings">設定 AI</button></p>
          <p class="dc-notice" data-ref="notice" role="status"></p>
        </footer>
      </section>
      <dialog class="dc-settings" data-ref="settings" aria-labelledby="${instanceId}-settings-title">
        <form data-ref="settings-form" autocomplete="off">
          <div class="dc-settings-heading"><div><h2 id="${instanceId}-settings-title">AI 連線設定</h2><p>接駁你自己用開嘅模型服務。</p></div><button type="button" class="dc-icon-button" data-action="close-settings" aria-label="關閉設定">${svg('close')}</button></div>
          <label>API 格式<select name="protocol"><option value="responses">Responses API</option><option value="chat-completions">Chat Completions 相容 API</option><option value="custom">自訂回覆服務</option></select></label>
          <label>API 網址<input name="endpoint" type="url" placeholder="https://api.openai.com/v1/responses" required spellcheck="false"></label>
          <label>模型名稱<input name="model" type="text" placeholder="輸入你帳戶可用的模型 ID" spellcheck="false"></label>
          <label class="dc-stream-setting"><input name="stream" type="checkbox"><span>逐步顯示回覆<small>邊生成邊顯示，需模型服務支援。</small></span></label>
          <label>API key<input name="apiKey" type="password" autocomplete="off" placeholder="服務不需要 key 時可留空" spellcheck="false" data-lpignore="true"></label>
          <label class="dc-stream-setting"><input name="rememberKey" type="checkbox"><span>記住 API key<small>只存喺此瀏覽器，重新整理後繼續使用。</small></span></label>
          <div class="dc-key-actions"><span data-ref="key-status" role="status"></span><button type="button" data-action="forget-key">清除 key</button></div>
          <p class="dc-settings-note" data-ref="provider-note"></p>
          <p class="dc-settings-note">Key 只會傳送至你設定的 API 網址。取消「記住 API key」並套用後，只保留喺目前分頁。服務必須允許瀏覽器連線；聊天儲存開關只控制對話記錄。</p>
          <p class="dc-settings-error" data-ref="settings-error" role="alert"></p>
          <div class="dc-settings-actions"><button type="button" data-action="close-settings">取消</button><button type="submit">套用設定</button></div>
        </form>
      </dialog>`;
    const ref = (name) => root.querySelector('[data-ref="' + name + '"]');
    const input = ref('input');

    function notice(message) { ref('notice').textContent = message; }
    function failStorage(message) {
      storageError = message;
      notice(message);
    }
    try {
      storage = global.localStorage;
      const probe = config.storageKey + ':probe:' + uid();
      storage.setItem(probe, '1');
      storage.removeItem(probe);
    } catch (_) {
      storage = null;
      defaultSave = false;
      storageError = '瀏覽器未能使用儲存空間。對話可繼續，但重新整理後會消失。';
    }
    function read(key) {
      try { return JSON.parse(storage?.getItem(key) || 'null'); }
      catch (_) { return null; }
    }
    function updateKeyStatus() {
      const saved = read(credentialKey);
      ref('key-status').textContent = !storage ? '瀏覽器未能儲存，只限目前分頁。'
        : saved?.endpoint === config.endpoint && typeof saved?.apiKey === 'string' && saved.apiKey ? '已記住此連線的 API key' : '尚未記住 API key';
      root.querySelector('[data-action="forget-key"]').disabled = !config.apiKey && !ref('settings-form').elements.apiKey.value && !saved?.apiKey;
    }
    function removeSavedKey() {
      if (!storage) return true;
      try {
        storage.removeItem(credentialKey);
        if (storage.getItem(credentialKey) !== null) throw new Error('remove_failed');
        return true;
      } catch (_) {
        ref('settings-error').textContent = '未能清除已記住的 API key。請檢查瀏覽器儲存權限後再試。';
        return false;
      }
    }
    function clearKey() {
      if (!removeSavedKey()) return;
      config.apiKey = '';
      ref('settings-form').elements.apiKey.value = '';
      ref('settings-error').textContent = '';
      updateKeyStatus();
      notice(storage ? '已清除此瀏覽器記住的 API key。' : '已清除目前分頁的 API key；瀏覽器儲存空間暫時無法存取。');
    }
    function write(key, value) {
      try { storage.setItem(key, JSON.stringify(value)); return true; }
      catch (_) { failStorage('未能儲存，可能是瀏覽器空間不足。目前對話仍在畫面內；你可以下載備份。'); return false; }
    }
    function forget(id) {
      if (!storage) return true;
      try {
        storage.removeItem(prefix + id);
        return storage.getItem(prefix + id) === null;
      } catch (_) {
        failStorage('未能刪除已存副本。請檢查瀏覽器權限，或在瀏覽器設定清除此網站資料。');
        return false;
      }
    }
    function sanitize(value) {
      if (!isRecord(value) || value.version !== 1 || typeof value.id !== 'string' || !Array.isArray(value.messages)) return null;
      const messages = value.messages.filter((m) => isRecord(m) && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').map((m) => ({
        role: m.role, content: m.content.slice(0, 16000), at: typeof m.at === 'string' ? m.at : '', links: safeLinks(m.links), ...(['stopped', 'incomplete', 'limit'].includes(m.status) ? { status: m.status } : {}), ...(m.role === 'assistant' && safeDelivery(m.delivery) ? { delivery: safeDelivery(m.delivery) } : {}), ...(m.role === 'assistant' && safeSources(m.sources).length ? { sources: safeSources(m.sources) } : {}), ...(m.role === 'assistant' && safeCitations(m.citations, Math.min(m.content.length, 16000)).length ? { citations: safeCitations(m.citations, Math.min(m.content.length, 16000)) } : {}), ...(m.role === 'user' && safeImage(m.image) ? { image: safeImage(m.image) } : {}),
      }));
      if (!messages.length) return null;
      return { version: 1, id: value.id, title: String(value.title || '新對話').slice(0, 60), createdAt: String(value.createdAt || ''), updatedAt: String(value.updatedAt || ''), messages };
    }
    function savedRecords() {
      if (!storage) return [];
      try {
        const records = [];
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key?.startsWith(prefix)) {
            const record = sanitize(read(key));
            if (record && key === prefix + record.id) records.push(record);
          }
        }
        return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      } catch (_) { failStorage('暫時未能讀取已儲存的對話。'); return []; }
    }
    function preferences() {
      if (!storage) return;
      write(metaKey, { saveByDefault: defaultSave, activeId: active.save && active.messages.length ? active.id : null });
    }
    function persist() {
      if (!active.save || !storage || !active.messages.length) return;
      const { save, ...record } = active;
      if (write(prefix + active.id, record)) {
        storageError = '';
        notice('');
        preferences();
      }
    }
    function blank() {
      const now = new Date().toISOString();
      return { version: 1, id: uid(), title: '新對話', createdAt: now, updatedAt: now, messages: [], save: Boolean(storage) && defaultSave };
    }
    function safeLinks(links) {
      return (Array.isArray(links) ? links : []).filter((link) => isRecord(link) && typeof link.href === 'string' && typeof link.label === 'string').flatMap((link) => {
        try {
          const base = config.endpoint ? new URL(config.endpoint, location.href).href : location.href;
          const url = new URL(link.href, base);
          return ['https:', 'http:'].includes(url.protocol) ? [{ href: url.href, label: link.label.slice(0, 180) }] : [];
        } catch (_) { return []; }
      }).slice(0, 8);
    }
    function safeImage(image) {
      if (!isRecord(image) || typeof image.dataUrl !== 'string' || image.dataUrl.length > 1500000 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.dataUrl)) return null;
      return { dataUrl: image.dataUrl, name: String(image.name || '圖片').slice(0, 160) };
    }
    function clearImage() {
      selectedImage = null;
      ref('image-input').value = '';
      ref('image-preview-img').removeAttribute('src');
      ref('image-preview').hidden = true;
    }
    async function prepareImage(file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 20 * 1024 * 1024) throw new Error('請選擇 20 MB 以下的 JPG、PNG 或 WebP 圖片。');
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      try {
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('無法讀取圖片，請改用另一張圖片。')); image.src = objectUrl; });
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (!width || !height || width * height > 80000000) throw new Error('圖片尺寸過大或無效，請先縮細再試。');
        // Rasterize uploads before sending: no SVG, external references or EXIF metadata.
        for (const [maxEdge, quality] of [[2048, .88], [1600, .82], [1200, .76], [800, .7]]) {
          const scale = Math.min(1, maxEdge / Math.max(width, height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('瀏覽器未能處理圖片。');
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          canvas.width = canvas.height = 1;
          if (dataUrl.length <= 1100000) return { dataUrl, name: file.name.slice(0, 160) };
        }
        throw new Error('圖片壓縮後仍太大，請裁剪或縮細後再試。');
      } finally { URL.revokeObjectURL(objectUrl); }
    }
    function renderHistory() {
      const history = ref('history');
      history.replaceChildren();
      const records = savedRecords();
      ref('count').textContent = records.length;
      if (!records.length) {
        const empty = textNode('div', 'dc-history-empty', '你嘅對話，由你保管。');
        empty.append(textNode('p', '', '開啟「儲存此對話」後，\n記錄就會喺呢度出現。'));
        history.append(empty);
      }
      records.forEach((record) => {
        const row = document.createElement('div');
        row.className = 'dc-history-item' + (record.id === active.id ? ' is-active' : '');
        const button = document.createElement('button');
        button.className = 'dc-history-open';
        button.disabled = busy;
        button.setAttribute('aria-current', String(record.id === active.id));
        const icon = document.createElement('span');
        icon.innerHTML = svg('chat');
        button.append(icon, textNode('span', '', record.title));
        button.title = record.title;
        button.addEventListener('click', () => load(record.id));
        const remove = document.createElement('button');
        remove.className = 'dc-icon-button dc-history-delete';
        remove.innerHTML = svg('trash');
        remove.setAttribute('aria-label', '刪除對話：' + record.title);
        remove.disabled = busy;
        remove.addEventListener('click', () => deleteRecord(record.id));
        row.append(button, remove);
        history.append(row);
      });
    }
    function updateStatus() {
      ref('save').checked = active.save;
      ref('save').disabled = !storage;
      ref('save-description').textContent = active.save
        ? '已開啟 · 記錄只儲存在此瀏覽器；關閉會刪除此對話的已存副本。'
        : '已關閉 · 此對話只保留在當前畫面，重新整理後不會還原。';
      ref('record-status').textContent = storageError ? '儲存未完成' : active.save ? '● 只在此裝置儲存' : '○ 此對話不儲存';
      ref('record-status').className = active.save && !storageError ? 'dc-saved-label' : '';
      root.querySelector('[data-action="export"]').disabled = !active.messages.length;
    }
    function bubble(message) {
      const row = document.createElement('article');
      row.className = 'dc-message dc-message--' + message.role;
      const avatar = textNode('div', 'dc-avatar', message.role === 'user' ? '你' : 'AI');
      avatar.setAttribute('aria-hidden', 'true');
      const body = document.createElement('div');
      body.className = 'dc-message-body';
      const header = textNode('div', 'dc-message-author', message.role === 'user' ? '你' : '助手');
      const date = new Date(message.at);
      if (!Number.isNaN(date.getTime())) {
        const time = textNode('time', '', date.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false }));
        time.dateTime = message.at;
        header.append(time);
      }
      const content = textNode('div', 'dc-message-text' + (message.role === 'assistant' ? ' dc-rich-text' : ''), '');
      if (message.role === 'assistant') content.append(assistantContent(message));
      else content.textContent = message.content;
      body.append(header, content);
      const sources = safeSources(message.sources);
      if (message.role === 'assistant' && sources.length) {
        const details = textNode('details', 'dc-sources', '');
        details.append(textNode('summary', '', '搜尋來源（' + sources.length + '）'));
        const list = document.createElement('ul');
        sources.forEach((source) => {
          const li = document.createElement('li');
          const anchor = textNode('a', '', source.title + ' ↗');
          anchor.href = source.url;
          anchor.title = source.url;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          li.append(anchor);
          list.append(li);
        });
        details.append(list);
        body.append(details);
      }
      if (message.status) body.append(textNode('div', 'dc-message-status', message.status === 'stopped' ? '已停止回覆' : message.status === 'limit' ? '回覆已達顯示長度上限。' : '回覆中斷，已保留已收到的內容。'));
      const delivery = safeDelivery(message.delivery);
      if (delivery) {
        const details = textNode('details', 'dc-delivery-info', '');
        details.append(textNode('summary', '', '回覆資訊'));
        details.append(textNode('p', '', '接收方式：' + (delivery.mode === 'stream' ? '串流接收（' + delivery.chunks + ' 批資料）' : '完整回覆一次接收')));
        details.append(textNode('p', '', delivery.firstTextMs === null ? '未收到文字回覆。' : '開始收到文字：' + (delivery.firstTextMs / 1000).toFixed(1) + ' 秒'));
        details.append(textNode('p', '', (message.status ? '結束等候：' : '回覆完成：') + (delivery.totalMs / 1000).toFixed(1) + ' 秒'));
        body.append(details);
      }
      const image = safeImage(message.image);
      if (image) {
        const preview = document.createElement('img');
        preview.className = 'dc-message-image';
        preview.src = image.dataUrl;
        preview.alt = image.name;
        body.append(preview);
      }
      safeLinks(message.links).forEach((link) => {
        const anchor = textNode('a', 'dc-message-link', link.label + ' ↗');
        anchor.href = link.href;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        body.append(anchor);
      });
      row.append(avatar, body);
      return row;
    }
    function scroll() { ref('thread').scrollTop = ref('thread').scrollHeight; }
    function renderConversation() {
      ref('welcome').hidden = active.messages.length > 0;
      ref('messages').replaceChildren(...active.messages.map(bubble));
      updateStatus();
      renderHistory();
      scroll();
    }
    function append(role, content, links = [], image = null, delivery = null, web = {}) {
      const message = { role, content, at: new Date().toISOString(), links: safeLinks(links), ...(role === 'assistant' && safeDelivery(delivery) ? { delivery: safeDelivery(delivery) } : {}), ...(role === 'assistant' && safeSources(web.sources).length ? { sources: safeSources(web.sources) } : {}), ...(role === 'assistant' && safeCitations(web.citations, content.length).length ? { citations: safeCitations(web.citations, content.length) } : {}), ...(safeImage(image) ? { image: safeImage(image) } : {}) };
      active.messages.push(message);
      active.updatedAt = message.at;
      if (role === 'user' && active.title === '新對話') active.title = content.replace(/\s+/g, ' ').slice(0, 40);
      ref('welcome').hidden = true;
      ref('messages').append(bubble(message));
      persist();
      updateStatus();
      renderHistory();
      scroll();
      return message;
    }
    function setBusy(value) {
      busy = value;
      updateSearchToggle();
      input.disabled = value;
      ref('form').querySelectorAll('button, input').forEach((control) => { control.disabled = value; });
      const generating = value && Boolean(requestController);
      ref('stop').hidden = !generating;
      ref('stop').disabled = !generating;
      root.querySelector('.dc-send:not(.dc-stop)').hidden = generating;
      root.querySelector('[data-action="remove-image"]').disabled = value;
      root.querySelector('[data-action="new"]').disabled = value;
      root.querySelectorAll('[data-question]').forEach((button) => { button.disabled = value; });
      ref('messages').setAttribute('aria-busy', String(value));
      renderHistory();
    }
    function showHistory(show) {
      root.classList.toggle('dc-history-visible', show);
      root.querySelector('[data-action="history"]').setAttribute('aria-expanded', String(show));
      if (show) requestAnimationFrame(() => { if (!destroyed) root.querySelector('[data-action="new"]').focus(); });
      else root.querySelector('[data-action="history"]').focus();
    }
    function updateMode() {
      ref('mode').textContent = config.reply ? '自訂 AI 服務' : config.endpoint ? (config.model || '請設定模型名稱') : '設定 AI 後開始聊天';
      updateSearchToggle();
    }
    function updateSearchToggle() {
      const button = root.querySelector('[data-action="search"]');
      const available = !config.reply && config.protocol === 'responses';
      button.disabled = busy || !available;
      button.setAttribute('aria-pressed', String(available && config.webSearch));
      button.title = available ? config.webSearch ? '已開啟：AI 會按需要搜尋網頁' : '開啟網頁搜尋' : '請在 AI 設定選用支援搜尋的連線';
    }
    function rememberConnection() {
      return !storage || write(connectionKey, { endpoint: config.endpoint, model: config.model, protocol: config.protocol, stream: config.stream, rememberKey: config.rememberKey, webSearch: config.webSearch });
    }
    function showSettings() {
      if (busy) return;
      showHistory(false);
      const form = ref('settings-form');
      form.elements.protocol.value = config.protocol;
      form.elements.endpoint.value = config.endpoint || 'https://api.openai.com/v1/responses';
      form.elements.model.value = config.model;
      form.elements.stream.checked = config.stream;
      form.elements.stream.disabled = config.protocol === 'custom';
      form.elements.apiKey.value = config.apiKey;
      form.elements.rememberKey.checked = Boolean(storage) && config.rememberKey;
      form.elements.rememberKey.disabled = !storage;
      ref('settings-error').textContent = '';
      updateProviderNote();
      updateKeyStatus();
      ref('settings').showModal();
    }
    function updateProviderNote() {
      try {
        const hostname = new URL(ref('settings-form').elements.endpoint.value).hostname;
        ref('provider-note').textContent = hostname === 'tianyuai.lol' || hostname.endsWith('.tianyuai.lol')
          ? '天域：請使用 default 群組、允許目前模型的 API key。Playground 的群組選擇不會更改現有令牌設定。'
          : '';
      } catch (_) { ref('provider-note').textContent = ''; }
    }
    function newChat() {
      if (busy) return;
      active = blank();
      clearImage();
      input.value = '';
      input.style.height = '';
      preferences();
      renderConversation();
      showHistory(false);
      input.focus();
    }
    function load(id) {
      if (busy) return;
      const record = sanitize(read(prefix + id));
      if (!record) { renderHistory(); return; }
      active = { ...record, save: true };
      clearImage();
      input.value = '';
      input.style.height = '';
      preferences();
      renderConversation();
      showHistory(false);
      input.focus();
    }
    function deleteRecord(id) {
      if (busy || !forget(id)) return false;
      if (id === active.id) {
        // Deletion must not be undone by the next assistant reply.
        active.save = false;
        preferences();
        updateStatus();
      }
      renderHistory();
      notice('已刪除儲存記錄；目前畫面內的對話仍可繼續。');
      return true;
    }
    function setSaving(enabled) {
      if (!storage) { updateStatus(); notice(storageError); return false; }
      if (!enabled && !forget(active.id)) { updateStatus(); return false; }
      active.save = Boolean(enabled);
      defaultSave = active.save;
      preferences();
      if (active.save) persist();
      else { storageError = ''; notice('已關閉儲存，並移除此對話的已存副本。'); }
      updateStatus();
      renderHistory();
      return true;
    }
    async function request(message, signal, onDelta, onProgress) {
      const history = active.messages.slice(0, -1).map((entry) => ({ role: entry.role, content: entry.role === 'assistant' ? citedText(entry) : entry.content, ...(safeImage(entry.image) ? { image: safeImage(entry.image) } : {}) }));
      const image = safeImage(active.messages.at(-1)?.image);
      const payload = { message, history, request_id: uid(), ...(image ? { image } : {}) };
      if (typeof config.reply === 'function') return config.reply({ ...payload, signal, onDelta });
      const messages = [...history, { role: 'user', content: message, image }].map((entry) => {
        const attachment = safeImage(entry.image);
        const content = !attachment ? entry.content : config.protocol === 'responses'
          ? [{ type: 'input_text', text: entry.content }, { type: 'input_image', image_url: attachment.dataUrl, detail: 'auto' }]
          : [{ type: 'text', text: entry.content }, { type: 'image_url', image_url: { url: attachment.dataUrl, detail: 'auto' } }];
        return { role: entry.role, content };
      });
      const body = config.protocol === 'responses'
        ? { model: config.model, input: messages, store: false, stream: config.stream }
        : config.protocol === 'chat-completions'
          ? { model: config.model, messages, stream: config.stream }
          : payload;
      if (config.protocol === 'responses' && config.webSearch) {
        body.tools = [{ type: 'web_search' }];
        body.tool_choice = 'auto';
        body.include = ['web_search_call.action.sources'];
      }
      const headers = { 'Content-Type': 'application/json' };
      if (config.apiKey) headers.Authorization = 'Bearer ' + config.apiKey;
      const response = await fetch(config.endpoint, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'omit', signal });
      const isStream = response.ok && config.protocol !== 'custom' && response.headers.get('Content-Type')?.toLowerCase().includes('text/event-stream');
      onProgress({ mode: isStream ? 'stream' : 'complete', stage: isStream ? 'connected' : 'complete' });
      if (isStream) return streamReply(response, config.protocol, onDelta, onProgress);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw serviceError(data, response.status);
      if (config.protocol === 'custom') return data;
      const result = config.protocol === 'responses' ? responseResult(data) : { reply: replyText(data, config.protocol) };
      const { reply } = result;
      if (typeof reply !== 'string' || !reply.trim()) throw new Error('empty_reply');
      return { ...result, ...(reply.length > 16000 ? { status: 'limit' } : data.status === 'incomplete' ? { status: 'incomplete' } : {}) };
    }
    async function send(message) {
      message = String(message || '').trim().slice(0, 4000);
      if (busy || destroyed || (!message && !selectedImage)) return false;
      if (!message && selectedImage) message = '請分析呢張圖片。';
      const needsKey = config.endpoint && /(^|\.)(tianyuai\.lol|openai\.com)$/.test(new URL(config.endpoint, location.href).hostname);
      if (typeof config.reply !== 'function' && (!config.endpoint || (config.protocol !== 'custom' && !config.model) || (needsKey && !config.apiKey))) {
        input.value = message;
        showSettings();
        notice(needsKey && !config.apiKey ? '請先喺設定輸入 API key。' : '先設定 AI 連線，就可以開始聊天。');
        return false;
      }
      const controller = new AbortController();
      requestController = controller;
      setBusy(true);
      notice('');
      append('user', message, [], selectedImage);
      clearImage();
      input.value = '';
      input.style.height = '';
      const pending = textNode('div', 'dc-pending', '');
      const pendingLabel = textNode('span', '', '等候模型回覆…');
      const pendingElapsed = textNode('span', 'dc-wait-elapsed', '');
      pendingElapsed.setAttribute('aria-hidden', 'true');
      pending.append(pendingLabel, pendingElapsed);
      ref('messages').append(pending);
      scroll();
      const startedAt = performance.now();
      const delivery = { mode: 'complete', firstTextMs: null, totalMs: 0, chunks: 0 };
      const deliveryInfo = () => ({ ...delivery, totalMs: Math.max(0, performance.now() - startedAt) });
      const updateWait = () => {
        const seconds = Math.floor((performance.now() - startedAt) / 1000);
        pendingElapsed.textContent = '已等候 ' + (seconds >= 60 ? Math.floor(seconds / 60) + ' 分 ' : '') + seconds % 60 + ' 秒 · 可隨時停止回覆';
      };
      updateWait();
      // This timer only updates the waiting label. Requests have no automatic deadline.
      const waitTimer = setInterval(updateWait, 1000);
      const onProgress = (progress) => {
        if (destroyed || controller.signal.aborted) return;
        if (progress.mode) delivery.mode = progress.mode;
        if (progress.chunk) delivery.chunks++;
        if (progress.sources) web.sources = safeSources(progress.sources);
        if (progress.citations) web.citations = safeCitations(progress.citations);
        if (draft && (progress.sources || progress.citations)) {
          draft.sources = web.sources;
          draft.citations = web.citations;
          if (paint === null) paint = requestAnimationFrame(paintDraft);
        }
        if (progress.stage === 'searching' || progress.stage === 'search-done') {
          ref('search-progress').hidden = false;
          ref('search-progress').textContent = progress.stage === 'searching' ? '正在搜尋網頁…' : '搜尋完成，正在整理回覆…';
        }
        if (progress.stage) pendingLabel.textContent = progress.stage === 'searching' ? '正在搜尋網頁…'
          : progress.stage === 'search-done' ? '搜尋完成，正在整理回覆…' : progress.stage === 'processing' ? '模型正在處理，等候文字回覆…'
          : progress.stage === 'complete' ? '等候服務傳回完整回覆…' : '服務已連接，等候文字回覆…';
      };
      const web = { sources: [], citations: [] };
      let draft = null, draftRow = null, paint = null, lastSaved = 0;
      const paintDraft = () => {
        paint = null;
        if (!draftRow || destroyed) return;
        const thread = ref('thread');
        const follow = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 100;
        draftRow.querySelector('.dc-message-text').replaceChildren(assistantContent(draft));
        if (follow) scroll();
      };
      const onDelta = (text) => {
        if (destroyed || controller.signal.aborted || typeof text !== 'string' || !text) return;
        delivery.mode = 'stream';
        if (delivery.firstTextMs === null) delivery.firstTextMs = Math.max(0, performance.now() - startedAt);
        pending.remove();
        if (!draft) {
          draft = append('assistant', text.slice(0, 16000), [], null, null, web);
          draftRow = ref('messages').lastElementChild;
          draftRow.classList.add('is-streaming');
          lastSaved = Date.now();
        } else {
          draft.content = text.slice(0, 16000);
          if (paint === null) paint = requestAnimationFrame(paintDraft);
          // Image histories can be large; avoid rewriting storage for every token.
          if (Date.now() - lastSaved >= 1000) { persist(); lastSaved = Date.now(); }
        }
      };
      const finishDraft = () => {
        if (paint !== null) cancelAnimationFrame(paint);
        paint = null;
        const thread = ref('thread');
        const follow = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 100;
        draftRow.replaceWith(bubble(draft));
        active.updatedAt = new Date().toISOString();
        persist();
        updateStatus();
        renderHistory();
        if (follow) scroll();
      };
      let onAbort;
      const aborted = new Promise((_, reject) => {
        onAbort = () => reject(new Error('aborted'));
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      try {
        const result = await Promise.race([
          request(message, controller.signal, onDelta, onProgress), aborted,
        ]);
        if (destroyed) return false;
        if (!result || typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('empty_reply');
        pending.remove();
        if (!draft) {
          draft = append('assistant', result.reply.slice(0, 16000), result.links, null, null, result);
          draftRow = ref('messages').lastElementChild;
        }
        draft.content = result.reply.slice(0, 16000);
        if (delivery.firstTextMs === null) delivery.firstTextMs = Math.max(0, performance.now() - startedAt);
        draft.delivery = deliveryInfo();
        draft.links = safeLinks(result.links);
        draft.sources = safeSources(result.sources);
        draft.citations = safeCitations(result.citations, draft.content.length);
        if (['stopped', 'incomplete', 'limit'].includes(result.status)) draft.status = result.status;
        else if (result.reply.length > 16000) draft.status = 'limit';
        finishDraft();
      } catch (error) {
        if (destroyed) return false;
        pending.remove();
        const reason = error.kind === 'channel_unavailable' ? 'API 供應商目前沒有此模型的可用渠道。請確認令牌分組及模型名稱，或稍後再試。'
          : error.kind === 'model_unavailable' ? 'API 服務未提供此模型。請在 AI 設定選擇供應商目前可用的模型名稱。'
          : error.kind === 'search_unavailable' ? '目前模型服務未接受網頁搜尋。可以關閉「網頁搜尋」後再試。'
          : error.status === 401 || error.status === 403 ? '連線未獲授權，請檢查 API key 及模型權限。'
          : error.status === 429 ? '服務暫時達到用量上限，請稍後再試。'
          : [408, 504, 524].includes(error.status) ? '模型服務連線逾時，未能收到完整回覆。請稍後再試。'
          : error.status === 400 && active.messages.some((m) => m.image) ? '服務未接受圖片請求。請確認目前模型及渠道支援圖片輸入，或開始新對話只傳文字。'
          : error.status === 413 ? '圖片請求超過服務限制，請改用較小的圖片。'
          : '暫時未能連接 AI，請檢查設定及服務是否允許瀏覽器連線。';
        const stopped = controller.signal.reason === 'user';
        if (draft) {
          draft.delivery = deliveryInfo();
          draft.status = stopped ? 'stopped' : 'incomplete';
          finishDraft();
          if (!stopped) notice(reason + ' 已保留收到的部分回覆。');
        } else if (stopped) notice('已停止回覆。');
        else append('assistant', reason, [], null, deliveryInfo());
      } finally {
        clearInterval(waitTimer);
        controller.signal.removeEventListener('abort', onAbort);
        if (paint !== null) cancelAnimationFrame(paint);
        pending.remove();
        if (!destroyed) ref('search-progress').hidden = true;
        requestController = null;
        if (!destroyed) { setBusy(false); input.focus(); }
      }
      return true;
    }
    function exportChat() {
      if (!active.messages.length) return;
      const transcript = ['Chat · ' + active.title, '', ...active.messages.map((m) => '[' + m.at + '] ' + (m.role === 'user' ? '你' : '助手') + '\n' + (m.role === 'assistant' ? citedText(m) : m.content) + (safeSources(m.sources).length ? '\n\n搜尋來源：\n' + safeSources(m.sources).map((source) => source.title + ': ' + source.url).join('\n') : '') + (m.image ? '\n[圖片：' + m.image.name + '；文字下載不包含圖片內容]' : '') + (m.links.length ? '\n' + m.links.map((link) => link.label + ': ' + link.href).join('\n') : '') + '\n')].join('\n');
      const url = URL.createObjectURL(new Blob(['\ufeff' + transcript], { type: 'text/plain;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'chatbot-app-' + new Date().toISOString().slice(0, 10) + '.txt';
      root.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const listen = (node, type, callback) => node.addEventListener(type, callback, { signal: abortEvents.signal });
    listen(root, 'click', (event) => {
      const button = event.target.closest('button');
      if (!button || !root.contains(button) || button.disabled) return;
      const action = button.dataset.action;
      if (action === 'new') newChat();
      if (action === 'history') showHistory(true);
      if (action === 'close-history') showHistory(false);
      if (action === 'export') exportChat();
      if (action === 'settings') showSettings();
      if (action === 'close-settings') ref('settings').close();
      if (action === 'attach') ref('image-input').click();
      if (action === 'remove-image') clearImage();
      if (action === 'stop') requestController?.abort('user');
      if (action === 'forget-key') clearKey();
      if (action === 'search') {
        config.webSearch = !config.webSearch;
        rememberConnection();
        updateSearchToggle();
      }
      if (button.dataset.question) send(button.dataset.question);
    });
    listen(ref('save'), 'change', () => setSaving(ref('save').checked));
    listen(ref('form'), 'submit', (event) => { event.preventDefault(); send(input.value); });
    listen(ref('image-input'), 'change', async () => {
      const file = ref('image-input').files?.[0];
      if (!file || busy) return;
      setBusy(true);
      notice('正在處理圖片…');
      try {
        const prepared = await prepareImage(file);
        if (destroyed) return;
        selectedImage = prepared;
        ref('image-preview-img').src = prepared.dataUrl;
        ref('image-name').textContent = prepared.name;
        ref('image-preview').hidden = false;
        notice('圖片已準備好，輸入問題或直接傳送。');
      } catch (error) {
        if (!destroyed) { clearImage(); notice(error.message || '未能處理圖片。'); }
      } finally {
        if (!destroyed) { setBusy(false); input.focus(); }
      }
    });
    listen(ref('settings-form'), 'submit', (event) => {
      event.preventDefault();
      const fields = ref('settings-form').elements;
      const protocol = fields.protocol.value;
      let endpoint;
      try {
        endpoint = new URL(fields.endpoint.value.trim());
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
        if ((endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:')) || endpoint.username || endpoint.password) throw new Error();
      } catch (_) {
        ref('settings-error').textContent = '請輸入 HTTPS API 網址，或本機服務的 HTTP 網址。';
        return;
      }
      const model = fields.model.value.trim();
      if (protocol !== 'custom' && !model) {
        ref('settings-error').textContent = '請輸入模型名稱。';
        fields.model.focus();
        return;
      }
      const apiKey = fields.apiKey.value.trim();
      const rememberKey = fields.rememberKey.checked && Boolean(storage);
      if ((!rememberKey || !apiKey) && !removeSavedKey()) return;
      config.endpoint = endpoint.href;
      config.model = model;
      config.protocol = protocol;
      config.stream = fields.stream.checked;
      config.apiKey = apiKey;
      config.rememberKey = rememberKey;
      let keySaved = true;
      if (rememberKey && apiKey) {
        try { storage.setItem(credentialKey, JSON.stringify({ endpoint: config.endpoint, apiKey })); }
        catch (_) { keySaved = false; }
      }
      // Credentials are separate from conversation records and are bound to this endpoint.
      const remembered = rememberConnection();
      updateMode();
      ref('settings').close();
      if (!keySaved) notice('已套用設定，但未能記住 API key。目前分頁仍可使用，重新整理後需再輸入。');
      else if (remembered) notice(rememberKey && apiKey ? '已套用設定並記住 API key，重新整理後可繼續使用。' : '已套用 AI 設定。輸入訊息開始聊天。');
      input.focus();
    });
    listen(ref('settings-form').elements.protocol, 'change', () => {
      const fields = ref('settings-form').elements;
      fields.stream.disabled = fields.protocol.value === 'custom';
      if (/^https:\/\/api\.openai\.com\/v1\/(responses|chat\/completions)$/.test(fields.endpoint.value)) {
        fields.endpoint.value = fields.protocol.value === 'responses' ? 'https://api.openai.com/v1/responses' : fields.protocol.value === 'chat-completions' ? 'https://api.openai.com/v1/chat/completions' : '';
      }
    });
    listen(ref('settings-form').elements.endpoint, 'input', updateProviderNote);
    listen(ref('settings-form').elements.apiKey, 'input', updateKeyStatus);
    listen(input, 'input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; });
    listen(input, 'keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !matchMedia('(pointer: coarse)').matches) { event.preventDefault(); send(input.value); }
    });
    listen(root, 'keydown', (event) => {
      if (event.key === 'Escape' && root.classList.contains('dc-history-visible')) showHistory(false);
      if (event.key === 'Tab' && root.classList.contains('dc-history-visible') && matchMedia('(max-width: 760px)').matches) {
        const focusable = [...root.querySelector('.dc-sidebar').querySelectorAll('button:not(:disabled), a[href]')].filter((node) => node.getClientRects().length);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    listen(global, 'storage', (event) => {
      if ((event.key === credentialKey && event.newValue === null || event.key === null) && config.rememberKey) {
        config.apiKey = '';
        ref('settings-form').elements.apiKey.value = '';
        updateKeyStatus();
      }
      if (event.key === null || event.key?.startsWith(prefix)) {
        if ((event.key === prefix + active.id || event.key === null) && !read(prefix + active.id) && active.save) {
          active.save = false;
          updateStatus();
          notice('此對話的儲存記錄已在另一個分頁刪除，目前對話已停止儲存。');
        }
        renderHistory();
      }
    });
    const meta = read(metaKey);
    const connection = read(connectionKey);
    if (!options.endpoint && isRecord(connection) && typeof connection.endpoint === 'string' && ['responses', 'chat-completions', 'custom'].includes(connection.protocol)) {
      config.endpoint = connection.endpoint;
      config.model = typeof connection.model === 'string' ? connection.model : '';
      config.protocol = connection.protocol;
      if (options.stream === undefined && typeof connection.stream === 'boolean') config.stream = connection.stream;
      if (options.rememberKey === undefined && typeof connection.rememberKey === 'boolean') config.rememberKey = connection.rememberKey;
      if (options.webSearch === undefined && typeof connection.webSearch === 'boolean') config.webSearch = connection.webSearch;
    }
    const credential = read(credentialKey);
    if (options.apiKey === undefined && !config.apiKey && config.rememberKey && credential?.endpoint === config.endpoint && typeof credential.apiKey === 'string') config.apiKey = credential.apiKey;
    if (storage && typeof meta?.saveByDefault === 'boolean') defaultSave = meta.saveByDefault;
    const restored = typeof meta?.activeId === 'string' ? sanitize(read(prefix + meta.activeId)) : null;
    active = restored ? { ...restored, save: true } : blank();
    updateMode();
    renderConversation();
    if (storageError) notice(storageError);
    const api = {
      send, newChat, setSaving, load, deleteRecord, exportChat, showSettings,
      getConversation: () => JSON.parse(JSON.stringify(active)),
      getSavedConversations: () => savedRecords(),
      destroy() {
        destroyed = true;
        config.apiKey = '';
        requestController?.abort();
        abortEvents.abort();
        root.replaceChildren();
        root.classList.remove('chatbot-app', 'dc-history-visible');
        delete root.chatbotInstance;
      },
    };
    root.chatbotInstance = api;
    return api;
  }
  global.Chatbot = Object.freeze({ mount });
})(window);
