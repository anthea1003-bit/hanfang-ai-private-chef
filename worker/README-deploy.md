# 部署步驟（給非技術操作者）

這個 Worker 是「漢方私廚」網站的中間層：AI 金鑰只存在這裡，網頁本身不會出現金鑰。

## 前置需求

電腦要先安裝 Node.js（免費）：到 <https://nodejs.org> 下載「LTS」版本，照畫面一路安裝即可。裝好之後，下面的 `npx` 指令才能使用。

## 四步部署

1. 開啟終端機，進到 `worker` 這個資料夾：
   ```
   cd worker
   ```

2. 登入 Cloudflare（第一次會跳出瀏覽器視窗要求登入／授權）：
   ```
   npx wrangler login
   ```

3. 設定 Gemini API 金鑰（貼上金鑰後按 Enter，畫面不會顯示金鑰內容）：
   ```
   npx wrangler secret put GEMINI_API_KEY
   ```

4. 部署：
   ```
   npx wrangler deploy
   ```
   部署完成後，終端機會顯示一個網址，長得像：
   `https://hanfang-api.<你的帳號>.workers.dev`

## 部署完成後，還要做一件事

把上面那個網址填進網站的 `index.html`，找到這一行：

```html
<script>window.HANFANG_API_BASE = '';</script>
```

改成（把網址填進單引號中間，結尾不要加斜線 `/`）：

```html
<script>window.HANFANG_API_BASE = 'https://hanfang-api.<你的帳號>.workers.dev';</script>
```

存檔後重新發布網站（GitHub Pages 會自動更新），照片辨識與語音陪煮就會改用真正的 AI。

## 之後要換金鑰或模型怎麼辦

- 換金鑰：重新執行第 3 步 `npx wrangler secret put GEMINI_API_KEY`，貼新的金鑰即可覆蓋。
- 換模型：編輯 `worker/wrangler.toml` 裡的 `GEMINI_MODEL`，改完再跑一次第 4 步 `npx wrangler deploy`。

## 想先在自己電腦測試（選用）

1. 在 `worker` 資料夾裡建一個名叫 `.dev.vars` 的檔案，內容只有一行（等號右邊換成你的金鑰）：
   ```
   GEMINI_API_KEY=你的金鑰
   ```
2. 在 `worker` 資料夾執行：
   ```
   npx wrangler dev
   ```
   終端機會顯示本機測試網址（通常是 `http://localhost:8787`），把它暫時填進 `index.html` 的 `window.HANFANG_API_BASE` 就能在本機試。

注意：`.dev.vars` 裡有金鑰，**絕對不要**上傳到 GitHub。這個資料夾已附 `.gitignore` 擋住它，請不要刪除那個檔案。
