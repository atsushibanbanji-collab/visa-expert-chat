import { useState, useRef, useEffect, useCallback } from 'react'
import { useChat } from './hooks/useChat'
import ChatMessage from './components/ChatMessage'
import AdminPage from './pages/AdminPage'

export default function App() {
  const { messages, loading, streaming, sendMessage, resetChat } = useChat()
  const [input, setInput] = useState('')
  const [page, setPage] = useState('chat')
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, scrollToBottom])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 150) + 'px'
    }
  }, [input])

  const handleSend = () => {
    if (!input.trim() || loading) return
    sendMessage(input)
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const showLoadingDots = loading && !streaming

  if (page === 'admin') {
    return (
      <>
        <AdminPage onBack={() => setPage('chat')} />
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap');
          * { box-sizing: border-box; }
          body { margin: 0; }
        `}</style>
      </>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8f9fb',
        fontFamily:
          "'Noto Sans JP', 'Hiragino Kaku Gothic ProN', -apple-system, sans-serif",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ヘッダー */}
      <header
        style={{
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            V
          </div>
          <div>
            <div
              style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}
            >
              米国ビザ選定アドバイザー
            </div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>
              ESTA / B / E / L / H-1B / F / J
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setPage('admin')}
            style={{
              padding: '7px 14px',
              fontSize: '12px',
              color: '#6b7280',
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
            onMouseOver={(e) => (e.target.style.background = '#e5e7eb')}
            onMouseOut={(e) => (e.target.style.background = '#f3f4f6')}
          >
            プロンプト編集
          </button>
          <button
            onClick={() => {
              resetChat()
              setInput('')
            }}
            style={{
              padding: '7px 14px',
              fontSize: '12px',
              color: '#6b7280',
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
            onMouseOver={(e) => (e.target.style.background = '#e5e7eb')}
            onMouseOut={(e) => (e.target.style.background = '#f3f4f6')}
          >
            新しい相談
          </button>
        </div>
      </header>

      {/* メッセージ一覧 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 16px',
          maxWidth: '720px',
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {showLoadingDots && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                padding: '14px 20px',
                borderRadius: '16px 16px 16px 4px',
                background: '#fff',
                border: '1px solid #f0f0f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              <div
                style={{ display: 'flex', gap: '5px', alignItems: 'center' }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: '#94a3b8',
                      animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 入力エリア */}
      <div
        style={{
          borderTop: '1px solid #e5e7eb',
          background: '#fff',
          padding: '14px 16px',
          position: 'sticky',
          bottom: 0,
        }}
      >
        <div
          style={{
            maxWidth: '720px',
            margin: '0 auto',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-end',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="こちらに入力してください..."
            rows={1}
            style={{
              flex: 1,
              padding: '10px 14px',
              fontSize: '14px',
              border: '1px solid #d1d5db',
              borderRadius: '10px',
              outline: 'none',
              resize: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              maxHeight: '150px',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
            onBlur={(e) => (e.target.style.borderColor = '#d1d5db')}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              padding: '10px 18px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#fff',
              background:
                !input.trim() || loading
                  ? '#93c5fd'
                  : 'linear-gradient(135deg, #1e40af, #2563eb)',
              border: 'none',
              borderRadius: '10px',
              cursor: !input.trim() || loading ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}
          >
            送信
          </button>
        </div>
        <div
          style={{
            maxWidth: '720px',
            margin: '8px auto 0',
            fontSize: '11px',
            color: '#9ca3af',
            textAlign: 'center',
          }}
        >
          この診断は一般的な情報提供を目的としています。個別のケースについてはグリーンフィールドの担当者にご相談ください。
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap');
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
        * { box-sizing: border-box; }
        body { margin: 0; }
      `}</style>
    </div>
  )
}
