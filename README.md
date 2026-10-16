# 專案任務追蹤（LINE LIFF 前端）

工作計畫表（Google Sheet）的手機前端。成員從 LINE OA「專案通知系統」的 Rich Menu 進入，用 LINE 帳號自動確認身分，可以新增任務、改狀態、改完成日；主管（興煜）可以看全員總覽與異動紀錄，並在每天 09:00／17:00 的 LINE 訊息收到異動摘要。

```
LINE Rich Menu → LIFF 前端（frontend/，部署在 Render）
                    │ ID Token
                    ▼
               GAS Web App（gas/Api.gs）
                    │ 驗證身分、讀寫工作表、寫異動紀錄
                    ▼
               Google Sheet「工作計畫表」
```

## 資料夾

| 路徑 | 內容 |
|---|---|
| `frontend/` | 靜態網站：`index.html`、`app.js`、`style.css`、`config.js` |
| `frontend/mock.js` | 本機預覽用的假資料，網址加 `?mock`（主管）或 `?mock=member`（成員） |
| `gas/Api.gs` | 要加進 GAS 專案「工作進度行事曆」的新檔案 |
| `gas/程式碼.gs-修改說明.md` | 現有 `程式碼.gs` 要改的 4 個地方 |

## 已確定的規則

- 身分：LINE ID Token 由 GAS 向 LINE 驗證，再對照 Script Properties 的 `LINE_USER_<工作表名稱>`；沒有綁定的帳號進不來。
- 成員只能改自己工作表的任務；主管（`CONFIG.LINE.MANAGER_SHEET_NAME`）多了「全員總覽」「異動紀錄」。
- 延後完成日、清除完成日都必須填原因；原因寫進異動紀錄，也會在備註最後加一行。
- 「延期」狀態維持現狀（選了就停止 LINE 提醒），但會進異動紀錄與主管摘要。
- 沒填預計完成日 = 待確認，不建行事曆、不發提醒。
- 主管的異動摘要併入每天 2 則 LINE 訊息，不額外推播。
- 直接在試算表改任務名稱、完成日、狀態，也會記進異動紀錄（標示「直接改表」）。

## 部署步驟

1. **GAS**
   1. 在 GAS 專案新增檔案 `Api.gs`，貼上 `gas/Api.gs`。
   2. 照 `gas/程式碼.gs-修改說明.md` 修改 `程式碼.gs`。
   3. 部署 → 新增部署作業 → 類型「網頁應用程式」，執行身分「我」，存取權「所有人」。
   4. 複製網址（結尾 `/exec`）。
2. **前端**：把網址填進 `frontend/config.js` 的 `API_URL`。
3. **GitHub**：推到 public repo（只需要 `frontend/`）。
4. **Render**：New → Static Site，選這個 repo
   - Build Command：`echo "static site"`
   - Publish Directory：`frontend`
5. **LIFF**：LINE Developers → 專案任務追蹤 → LIFF → Endpoint URL 改成 Render 網址。
6. **上線**：LINE Login channel 從 Developing 切成 Published，成員才登入得了。
7. **Rich Menu**（第四階段）：LINE OA Manager 設定按鈕連到 `https://liff.line.me/2012050830-iZpZJl3X`。

## 本機預覽

```bash
python -m http.server 5173 --directory frontend
```

打開 `http://localhost:5173/?mock`。
