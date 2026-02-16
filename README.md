# 米国ビザ選定アドバイザー

対話形式で米国ビザの選定を支援するWebアプリケーションです。

## セットアップ

### バックエンド

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# .env にAPIキーを設定
uvicorn main:app --reload --port 8000
```

### フロントエンド（別ターミナル）

```bash
cd frontend
npm install
npm run dev
```

ブラウザで http://localhost:5173 にアクセスしてください。

## システムプロンプトの更新

`backend/system_prompt.md` をテキストエディタで編集・保存するだけで、次の会話から新しいプロンプトが反映されます。サーバーの再起動は不要です。

## 構成

- **フロントエンド**: React + Vite (port 5173)
- **バックエンド**: FastAPI (port 8000)
- **AI**: Anthropic Claude API（ストリーミング対応）
