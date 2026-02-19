import { useState, useCallback, useEffect, useRef } from 'react'
import { API_BASE } from '../config'

const FALLBACK_INITIAL_MESSAGE = '読み込み中...'
const ERROR_INITIAL_MESSAGE =
  'こんにちは。適切なビザの選定をお手伝いします。\n\n渡米の目的を教えてください。'

export function useChat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: FALLBACK_INITIAL_MESSAGE },
  ])
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const initialMessageRef = useRef(FALLBACK_INITIAL_MESSAGE)
  const abortRef = useRef(null)

  // バックエンドから初期メッセージを取得（単一の情報源）
  useEffect(() => {
    fetch(`${API_BASE}/api/initial-message`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        initialMessageRef.current = data.content
        setMessages([{ role: 'assistant', content: data.content }])
      })
      .catch((err) => {
        console.error('初期メッセージの取得に失敗:', err)
        initialMessageRef.current = ERROR_INITIAL_MESSAGE
        setMessages([{ role: 'assistant', content: ERROR_INITIAL_MESSAGE }])
      })
  }, [])

  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    // 前のリクエストをキャンセル
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const userMsg = { role: 'user', content: trimmed }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setLoading(true)
    setStreaming(false)

    // API用メッセージ履歴を構築
    const apiMessages = [
      { role: 'assistant', content: initialMessageRef.current },
      ...newMessages.slice(1).map((m) => ({ role: m.role, content: m.content })),
    ]

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      let buffer = ''
      let doneOrError = false

      // ストリーミング開始時点でアシスタントメッセージを追加
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
      setStreaming(true)

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          // TextDecoderの最終フラッシュ（残存バッファを処理）
          buffer += decoder.decode()
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // 最後の要素は不完全な可能性があるのでバッファに戻す
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)

          if (data === '[DONE]') {
            doneOrError = true
            break
          }
          if (data.startsWith('[ERROR]')) {
            assistantContent += data.slice(8)
            doneOrError = true
            break
          }

          try {
            assistantContent += JSON.parse(data)
          } catch {
            assistantContent += data
          }
          // 最後のメッセージを更新
          setMessages((prev) => {
            const updated = [...prev]
            updated[updated.length - 1] = {
              role: 'assistant',
              content: assistantContent,
            }
            return updated
          })
        }
        if (doneOrError) break
      }

      // ストリーミングが空の場合のフォールバック
      if (!assistantContent) {
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: '申し訳ありません、応答を取得できませんでした。',
          }
          return updated
        })
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('チャット通信エラー:', err)
      setMessages((prev) => [
        ...prev.filter((m) => !(m.role === 'assistant' && m.content === '')),
        {
          role: 'assistant',
          content: '通信エラーが発生しました。バックエンドが起動しているか確認してください。',
        },
      ])
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
        setStreaming(false)
      }
    }
  }, [messages, loading])

  const resetChat = useCallback(() => {
    abortRef.current?.abort()
    setMessages([{ role: 'assistant', content: initialMessageRef.current }])
  }, [])

  return { messages, loading, streaming, sendMessage, resetChat }
}
