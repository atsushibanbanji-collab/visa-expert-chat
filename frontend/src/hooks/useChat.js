import { useState, useCallback } from 'react'

const INITIAL_MESSAGE = {
  role: 'assistant',
  content: 'こんにちは。適切なビザの選定をお手伝いします。\n\n渡米の目的を教えてください。',
}

export function useChat() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE])
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)

  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg = { role: 'user', content: trimmed }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setLoading(true)
    setStreaming(false)

    // API用メッセージ履歴を構築
    const apiMessages = [
      { role: 'assistant', content: INITIAL_MESSAGE.content },
      ...newMessages.slice(1).map((m) => ({ role: m.role, content: m.content })),
    ]

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      // ストリーミング開始時点でアシスタントメッセージを追加
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
      setStreaming(true)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)

          if (data === '[DONE]') break
          if (data.startsWith('[ERROR]')) {
            assistantContent += data.slice(8)
            break
          }

          assistantContent += data
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
    } catch {
      setMessages((prev) => [
        ...prev.filter((m) => !(m.role === 'assistant' && m.content === '')),
        {
          role: 'assistant',
          content: '通信エラーが発生しました。バックエンドが起動しているか確認してください。',
        },
      ])
    } finally {
      setLoading(false)
      setStreaming(false)
    }
  }, [messages, loading])

  const resetChat = useCallback(() => {
    setMessages([INITIAL_MESSAGE])
  }, [])

  return { messages, loading, streaming, sendMessage, resetChat }
}
