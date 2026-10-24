# Chat

獨立聊天工具，使用純 HTML、CSS、JavaScript，無需安裝套件或編譯，可部署至 GitHub Pages。

網站：[Chat](https://realdenniswong.github.io/chatbot/)

聊天內容會傳送到你設定的模型服務，沒有本地話題分類、內容過濾或預設 system prompt。模型服務按自身規則回覆。

## 開始使用

1. 打開 `index.html`，或透過靜態網頁服務開啟。
2. 按「設定 AI」或左側「AI 連線設定」。
3. 選擇 API 格式、填寫完整 API 網址、模型名稱及 API key。
4. 套用設定後開始聊天。

之前保存的天域 `gpt-5.5` 或 `gpt-5.6-sol-openai-compact` 設定會更新至 `gpt-5.6-luna`，其他連線資料保持優先。模型名稱不會自動授予 API key 存取權。

支援三種格式：

- **Responses API**：例如 `https://api.openai.com/v1/responses`。傳送 `{model, input, store: false, stream}`；串流時接收文字增量事件，否則讀取 `output` 訊息內的 `output_text`。
- **Chat Completions 相容 API**：填寫服務的完整 `/chat/completions` 網址。傳送 `{model, messages, stream}`；串流時接收 `choices[0].delta.content`，否則讀取 `choices[0].message.content`。
- **自訂回覆服務**：傳送 `{message, history, request_id}`，回傳 `{reply, links?}`。

模型名稱請使用你帳戶有權使用的模型 ID。沒有綁定任何模型，也沒有內置 API key。未設定連線時會打開設定，不會用固定回覆假扮 AI。

API key 只存於目前分頁的記憶體，**不會寫入 localStorage、聊天記錄、下載檔案或 GitHub**。重新整理後需再次輸入。網頁只會記住非敏感的 API 網址、模型名稱及格式。

連線由瀏覽器直接發出，服務需要允許網站的 CORS 請求。Key 會傳送到你填寫的 API 網址，請使用你信任的服務。亦可連接不需 key 的本機相容服務，例如 `http://localhost:1234/v1/chat/completions`，前提是該服務允許網頁連線。

聊天儲存開關只控制此瀏覽器，無法改變模型服務的記錄政策。Responses API 請求固定使用 `store: false`；這不是對服務端所有日誌的刪除保證。API 說明：[OpenAI 官方文件](https://developers.openai.com/api/docs/guides/migrate-to-responses#2-map-messages-to-items)。

## 回覆排版與逐步顯示

助手回覆支援基本 Markdown：標題、段落、粗體、斜體、清單、巢狀清單、引用、表格、連結、行內程式碼及程式碼區塊。字體及段落間距已調整，表格與程式碼區塊可橫向捲動。使用者輸入保持純文字。回覆中的原始 HTML 只會顯示為文字，不會執行。

「逐步顯示回覆」預設開啟，可在 AI 連線設定關閉。標準 API 使用 `stream: true` 接收 SSE，收到文字便顯示及更新排版，沒有先等完整回覆再播放的打字動畫。模型開始生成前仍可能需要等候；如果供應商把串流緩衝至最後才傳送，網頁亦只能等候。

- Chat Completions 及 Responses 均支援文字串流；格式依照[官方串流文件](https://developers.openai.com/api/docs/guides/streaming-responses)。
- 如果服務即使收到串流要求仍回傳完整 JSON，應用會照常顯示完整回覆；若服務拒絕串流要求，可關閉「逐步顯示回覆」再試。應用不會自動重送收費請求。
- 生成期間可按「停止回覆」。已收到的文字會保留，並標示停止或中斷狀態。
- 開啟儲存時，串流內容會定期保存，完成或停止後再保存一次。關閉儲存後，後續收到的內容亦不會寫回記錄。
- 自訂 JSON 回覆服務維持原有格式，不要求串流。嵌入時提供的 `reply` 函式可選擇呼叫 `onDelta(目前累積的完整文字)`，並在完成時回傳 `{reply}`。

## 圖片分析

按輸入框旁邊的迴紋針選擇圖片，預覽後輸入問題並傳送。只傳圖片時會使用「請分析呢張圖片。」作提示。

- 每則訊息支援一張 JPG、PNG 或 WebP，原檔最多 20 MB。
- 圖片在瀏覽器轉成 JPEG，最長邊最多 2048 像素，必要時再縮小，之後才傳送到設定的 API；壓縮可能降低細字清晰度。
- Chat Completions 使用 `text` 及 `image_url` 內容部件；Responses 使用 `input_text` 及 `input_image`。自訂回覆服務收到 `{image: {dataUrl, name}}`。
- 已傳送圖片會保留在本段對話上下文，方便繼續追問。
- 開啟儲存時連圖片一同保存；關閉會清除此對話的已存副本，包括圖片。未傳送的圖片只在記憶體中。
- 圖片會佔用較多 localStorage；空間不足時會提示。文字下載只包含圖片檔名，不包含圖片本身。
- 需要模型與中轉渠道同時支援圖片；格式依照[官方圖片輸入文件](https://developers.openai.com/api/docs/guides/images-vision)。2026-10-24 已在天域 Playground 及本應用用 `default` 群組及 `gpt-5.6-luna` 成功分析使用者提供的書頁照片，讀出牌名、英文名稱、關鍵字及正逆位摘要。之前 `GPT_plus` 群組的其他模型曾回覆「無可用渠道」；渠道錯誤不代表模型不支援圖片。
- 另外以無效測試 key 驗證跨來源請求，瀏覽器能正常讀取天域的 HTTP 401，沒有被 CORS 阻擋；此測試不驗證帳戶或模型權限。

## 聊天記錄

預設開啟「儲存此對話」，有訊息才儲存。使用目前網站的 localStorage，不會寫入 GitHub。

- 重開或重新整理可繼續目前已存對話，左側可重開其他已存對話。
- 關閉儲存：立即移除此對話的已存副本。畫面訊息保留，後續訊息不會保存，重新整理後不會還原。
- 再次開啟：儲存目前畫面中的完整對話，包括關閉期間的訊息。
- 「開始新對話」保留舊記錄，沿用最近一次選擇的儲存設定。
- 刪除記錄會同時停止儲存該對話，不會在下一則回覆後重新出現。
- 「下載對話」匯出文字檔；關閉儲存時仍可手動下載。
- 儲存空間不可用或已滿會顯示提示，仍可繼續聊天及下載。
- 清除網站資料、換瀏覽器或換裝置，無法還原此處記錄；私密瀏覽資料可能隨視窗關閉而移除。

儲存保留完整對話，送往模型的上下文亦包含此對話所有先前訊息。每則輸入最多 4,000 字元，回覆最多顯示 16,000 字元，連線逾時為 120 秒。長對話可能超過模型的上下文上限，屆時可開始新對話。

## 檔案與嵌入

- `index.html`：頁面入口。
- `chatbot.css`：以 `.chatbot-app` 範圍限制的樣式。
- `chatbot.js`：聊天元件、連線、記錄及儲存開關。
- `app.js`：頁面初始化。

```html
<link rel="stylesheet" href="./chatbot.css">
<div id="my-chat"></div>
<script src="./chatbot.js"></script>
<script>
  const chat = Chatbot.mount('#my-chat', {
    storageKey: 'my-personal-chat',
    saveByDefault: true
  });
</script>
```

可呼叫 `send(text)`、`newChat()`、`setSaving(boolean)`、`load(id)`、`deleteRecord(id)`、`getConversation()`、`getSavedConversations()`、`exportChat()`、`showSettings()`、`destroy()`。

亦可在初始化時傳入 `endpoint`、`model`、`protocol`、`stream`，或提供 `async reply({message, history, signal, onDelta})` 函式回傳 `{reply, links?}`。不要把 key 寫在公開程式碼內。

## GitHub Pages

將根目錄的 HTML、CSS、JS 及 `.nojekyll` 放入 repo，在 **Settings → Pages** 選擇分支及 `/ (root)` 發布。資源使用相對路徑，支援 GitHub Pages 的專案網址。正式使用建議 HTTP / HTTPS；`file://` 的瀏覽器儲存行為可能不同。

此 repo 使用 `main` 分支根目錄發布至 GitHub Pages。推送更新後，由 GitHub 自動更新網站。

GitHub Pages 與本機預覽屬於不同網站，聊天記錄按網站分開儲存。首次開啟公開網址時，需要重新輸入 API key；本機預覽的記錄會保留在原本網址。

## 驗證

瀏覽器整合測試需要開發環境提供 Playwright：

```sh
node tests/chatbot.browser.cjs
node tests/chatbot.streaming.cjs
```

如使用已安裝的 Chrome，可加上 `PLAYWRIGHT_CHANNEL=chrome`。部署檔案沒有任何套件依賴。
