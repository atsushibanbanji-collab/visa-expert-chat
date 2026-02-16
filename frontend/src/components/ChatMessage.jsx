export default function ChatMessage({ message }) {
  const isUser = message.role === 'user'

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '12px',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        {!isUser && (
          <div
            style={{
              fontSize: '11px',
              color: '#9ca3af',
              marginBottom: '4px',
              marginLeft: '4px',
              fontWeight: 500,
            }}
          >
            アドバイザー
          </div>
        )}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            background: isUser
              ? 'linear-gradient(135deg, #1e40af, #2563eb)'
              : '#fff',
            color: isUser ? '#fff' : '#1f2937',
            fontSize: '14px',
            lineHeight: 1.7,
            boxShadow: isUser ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
            border: isUser ? 'none' : '1px solid #f0f0f0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message.content}
        </div>
      </div>
    </div>
  )
}
