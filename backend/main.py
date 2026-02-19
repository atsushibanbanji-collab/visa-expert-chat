"""
米国ビザ選定アドバイザー - FastAPI バックエンド
"""
import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Literal, Optional

import anthropic
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="米国ビザ選定アドバイザー API")

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT_PATH = Path(__file__).parent / "system_prompt.md"
INITIAL_MESSAGE = "こんにちは。適切なビザの選定をお手伝いします。\n\n渡米の目的を教えてください。"

CHAT_TIMEOUT = httpx.Timeout(connect=5.0, read=60.0, write=10.0, pool=10.0)
EDIT_TIMEOUT = httpx.Timeout(connect=5.0, read=300.0, write=10.0, pool=10.0)


def get_system_prompt() -> str:
    """リクエストごとにsystem_prompt.mdを読み込む"""
    try:
        return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="system_prompt.md が見つかりません")


def get_client(timeout: httpx.Timeout = CHAT_TIMEOUT, max_retries: int = 2) -> anthropic.Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY が設定されていません")
    return anthropic.Anthropic(api_key=api_key, timeout=timeout, max_retries=max_retries)


def get_model() -> str:
    return os.getenv("MODEL_NAME", "claude-sonnet-4-20250514")


def compute_hash(content: str) -> str:
    """内容のハッシュを計算（楽観的ロック用）"""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=50000)


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=100)


class SystemPromptUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=500000)
    expected_hash: Optional[str] = None


class EditInstruction(BaseModel):
    instruction: str = Field(min_length=1, max_length=10000)


@app.get("/")
async def root():
    return {"message": "米国ビザ選定アドバイザー API"}


@app.get("/api/initial-message")
async def initial_message():
    return {"content": INITIAL_MESSAGE}


@app.get("/api/system-prompt")
async def read_system_prompt():
    content = get_system_prompt()
    return {"content": content, "hash": compute_hash(content)}


@app.put("/api/system-prompt")
async def update_system_prompt(data: SystemPromptUpdate):
    if data.expected_hash is not None:
        current = get_system_prompt()
        if compute_hash(current) != data.expected_hash:
            raise HTTPException(
                status_code=409,
                detail="プロンプトが別の操作で変更されています。最新の内容を確認してください。",
            )
    try:
        SYSTEM_PROMPT_PATH.write_text(data.content, encoding="utf-8")
        new_hash = compute_hash(data.content)
        logger.info("システムプロンプトを保存しました (%d 文字)", len(data.content))
        return {"message": "保存しました", "hash": new_hash}
    except OSError as e:
        logger.error("システムプロンプトの保存に失敗: %s", e)
        raise HTTPException(status_code=500, detail=f"保存に失敗しました: {str(e)}")


EDIT_META_PROMPT = """あなたはシステムプロンプトの編集者です。
ユーザーの指示に従って、以下のシステムプロンプトを修正してください。

ルール:
- 指示された箇所のみを変更し、それ以外は一切変更しない
- フォーマット（Markdown記法、インデント、改行）を維持する
- 修正後のシステムプロンプト全文のみを出力する（説明や前置きは不要）
- ```markdown 等のコードブロックで囲まない"""


@app.post("/api/system-prompt/edit")
async def edit_system_prompt(data: EditInstruction):
    current_prompt = get_system_prompt()
    client = get_client(timeout=EDIT_TIMEOUT, max_retries=0)
    model = get_model()

    logger.info("システムプロンプト編集を開始 (指示: %s...)", data.instruction[:50])
    try:
        with client.messages.stream(
            model=model,
            max_tokens=16000,
            system=EDIT_META_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"## 現在のシステムプロンプト\n\n{current_prompt}\n\n---\n\n## 編集指示\n\n{data.instruction}",
                }
            ],
        ) as stream:
            modified = stream.get_final_text()
        logger.info("システムプロンプト編集が完了")
        return {"original": current_prompt, "modified": modified, "original_hash": compute_hash(current_prompt)}
    except anthropic.APIError as e:
        logger.error("システムプロンプト編集でAPI呼び出しに失敗: %s", e)
        raise HTTPException(status_code=502, detail=f"API呼び出しに失敗しました: {str(e)}")


@app.post("/api/chat")
async def chat(request: ChatRequest):
    system_prompt = get_system_prompt()
    client = get_client()
    model = get_model()

    # メッセージ履歴を構築（初回のアシスタントメッセージを含む）
    api_messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

    logger.info("チャットリクエスト受信 (メッセージ数: %d)", len(api_messages))

    def event_stream():
        try:
            with client.messages.stream(
                model=model,
                max_tokens=1500,
                system=system_prompt,
                messages=api_messages,
            ) as stream:
                for text in stream.text_stream:
                    # SSE形式で送信（改行を含むチャンクに対応するためJSON化）
                    yield f"data: {json.dumps(text)}\n\n"
            yield "data: [DONE]\n\n"
            logger.info("チャットストリーミング完了")
        except anthropic.APIError as e:
            logger.error("チャットストリーミングでAPI呼び出しに失敗: %s", e)
            yield f"data: [ERROR] API呼び出しに失敗しました: {str(e)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
