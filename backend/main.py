"""
米国ビザ選定アドバイザー - FastAPI バックエンド
"""
import os
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="米国ビザ選定アドバイザー API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT_PATH = Path(__file__).parent / "system_prompt.md"
INITIAL_MESSAGE = "こんにちは。適切なビザの選定をお手伝いします。\n\n渡米の目的を教えてください。"


def get_system_prompt() -> str:
    """リクエストごとにsystem_prompt.mdを読み込む"""
    try:
        return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="system_prompt.md が見つかりません")


def get_client() -> anthropic.Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY が設定されていません")
    return anthropic.Anthropic(api_key=api_key)


def get_model() -> str:
    return os.getenv("MODEL_NAME", "claude-sonnet-4-20250514")


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]


class SystemPromptUpdate(BaseModel):
    content: str


class EditInstruction(BaseModel):
    instruction: str


@app.get("/")
async def root():
    return {"message": "米国ビザ選定アドバイザー API"}


@app.get("/api/initial-message")
async def initial_message():
    return {"content": INITIAL_MESSAGE}


@app.get("/api/system-prompt")
async def read_system_prompt():
    return {"content": get_system_prompt()}


@app.put("/api/system-prompt")
async def update_system_prompt(data: SystemPromptUpdate):
    try:
        SYSTEM_PROMPT_PATH.write_text(data.content, encoding="utf-8")
        return {"message": "保存しました"}
    except Exception as e:
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
    client = get_client()
    model = get_model()

    try:
        response = client.messages.create(
            model=model,
            max_tokens=16000,
            system=EDIT_META_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"## 現在のシステムプロンプト\n\n{current_prompt}\n\n---\n\n## 編集指示\n\n{data.instruction}",
                }
            ],
        )
        modified = response.content[0].text
        return {"original": current_prompt, "modified": modified}
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"API呼び出しに失敗しました: {e.message}")


@app.post("/api/chat")
async def chat(request: ChatRequest):
    system_prompt = get_system_prompt()
    client = get_client()
    model = get_model()

    # メッセージ履歴を構築（初回のアシスタントメッセージを含む）
    api_messages = []
    for msg in request.messages:
        api_messages.append({"role": msg.role, "content": msg.content})

    def event_stream():
        try:
            with client.messages.stream(
                model=model,
                max_tokens=1500,
                system=system_prompt,
                messages=api_messages,
            ) as stream:
                for text in stream.text_stream:
                    # SSE形式で送信
                    yield f"data: {text}\n\n"
            yield "data: [DONE]\n\n"
        except anthropic.APIError as e:
            yield f"data: [ERROR] API呼び出しに失敗しました: {e.message}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
