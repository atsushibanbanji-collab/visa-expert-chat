import { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../config'
import DiffView from '../components/DiffView'

export default function AdminPage({ onBack }) {
  const [mode, setMode] = useState('instruct') // 'instruct' | 'raw'
  const [instruction, setInstruction] = useState('')
  const [generating, setGenerating] = useState(false)
  const [editResult, setEditResult] = useState(null) // { original, modified }

  // Raw editor state
  const [rawContent, setRawContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [loadingRaw, setLoadingRaw] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [promptHash, setPromptHash] = useState(null)

  const instructionRef = useRef(null)
  const generateAbortRef = useRef(null)
  const saveAbortRef = useRef(null)

  // サーバーからプロンプトを再読み込み
  const reloadPrompt = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/system-prompt`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setRawContent(data.content)
      setSavedContent(data.content)
      setPromptHash(data.hash)
      setEditResult(null)
    } catch (err) {
      console.error('再読み込みに失敗:', err)
    }
  }

  // 初回読み込み
  useEffect(() => {
    fetch(`${API_BASE}/api/system-prompt`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setRawContent(data.content)
        setSavedContent(data.content)
        setPromptHash(data.hash)
      })
      .catch((err) => {
        console.error('システムプロンプトの読み込みに失敗:', err)
        setMessage({ type: 'error', text: '読み込みに失敗しました' })
      })
      .finally(() => setLoadingRaw(false))
  }, [])

  // Claudeに編集を依頼
  const handleGenerate = async () => {
    if (!instruction.trim()) return
    // 前のリクエストをキャンセル
    generateAbortRef.current?.abort()
    const controller = new AbortController()
    generateAbortRef.current = controller

    setGenerating(true)
    setEditResult(null)
    setMessage(null)

    try {
      const res = await fetch(`${API_BASE}/api/system-prompt/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: instruction.trim() }),
        signal: controller.signal,
      })
      if (!res.ok) {
        let detail = '生成に失敗しました'
        try {
          const data = await res.json()
          detail = data.detail || detail
        } catch { /* JSONパース失敗は無視 */ }
        setMessage({ type: 'error', text: detail })
        return
      }
      const data = await res.json()
      setEditResult(data)
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('編集生成エラー:', err)
      setMessage({ type: 'error', text: '通信エラーが発生しました' })
    } finally {
      if (!controller.signal.aborted) setGenerating(false)
    }
  }

  // 変更を適用（保存）
  const handleApply = async () => {
    if (!editResult || saving) return
    // 前の保存リクエストをキャンセル
    saveAbortRef.current?.abort()
    const controller = new AbortController()
    saveAbortRef.current = controller

    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/system-prompt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editResult.modified,
          expected_hash: editResult.original_hash,
        }),
        signal: controller.signal,
      })
      if (res.ok) {
        const result = await res.json()
        setSavedContent(editResult.modified)
        setRawContent(editResult.modified)
        setPromptHash(result.hash)
        setEditResult(null)
        setInstruction('')
        setMessage({ type: 'success', text: '適用しました' })
      } else if (res.status === 409) {
        setMessage({ type: 'error', text: '別の操作でプロンプトが変更されています。最新の内容を読み込み直します。' })
        await reloadPrompt()
      } else {
        setMessage({ type: 'error', text: '保存に失敗しました' })
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('適用エラー:', err)
      setMessage({ type: 'error', text: '通信エラーが発生しました' })
    } finally {
      if (!controller.signal.aborted) setSaving(false)
    }
  }

  // 変更を破棄
  const handleDiscard = () => {
    generateAbortRef.current?.abort()
    setEditResult(null)
    setMessage(null)
  }

  // Raw editor: 保存
  const handleRawSave = async () => {
    if (saving) return
    // 前の保存リクエストをキャンセル
    saveAbortRef.current?.abort()
    const controller = new AbortController()
    saveAbortRef.current = controller

    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`${API_BASE}/api/system-prompt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: rawContent, expected_hash: promptHash }),
        signal: controller.signal,
      })
      if (res.ok) {
        const result = await res.json()
        setSavedContent(rawContent)
        setPromptHash(result.hash)
        setMessage({ type: 'success', text: '保存しました' })
      } else if (res.status === 409) {
        setMessage({ type: 'error', text: '別の操作でプロンプトが変更されています。最新の内容を読み込み直します。' })
        await reloadPrompt()
      } else {
        setMessage({ type: 'error', text: '保存に失敗しました' })
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('保存エラー:', err)
      setMessage({ type: 'error', text: '通信エラーが発生しました' })
    } finally {
      if (!controller.signal.aborted) setSaving(false)
    }
  }

  // Ctrl+S
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (mode === 'raw' && rawContent !== savedContent && !saving) handleRawSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode, rawContent, savedContent, saving])

  // Enter送信（Shift+Enterで改行）
  const handleInstructionKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleGenerate()
    }
  }

  const rawHasChanges = rawContent !== savedContent
  const lineCount = rawContent.split('\n').length

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
          <button onClick={onBack} style={btnStyle}>
            ← チャットに戻る
          </button>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>
            システムプロンプト編集
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {message && (
            <span
              style={{
                fontSize: '12px',
                color: message.type === 'success' ? '#059669' : '#dc2626',
                fontWeight: 500,
              }}
            >
              {message.text}
            </span>
          )}
          {/* モード切替タブ */}
          <div
            style={{
              display: 'flex',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setMode('instruct')}
              style={{
                ...tabBtnStyle,
                background: mode === 'instruct' ? '#1e40af' : '#f3f4f6',
                color: mode === 'instruct' ? '#fff' : '#6b7280',
              }}
            >
              AIで編集
            </button>
            <button
              onClick={() => setMode('raw')}
              style={{
                ...tabBtnStyle,
                background: mode === 'raw' ? '#1e40af' : '#f3f4f6',
                color: mode === 'raw' ? '#fff' : '#6b7280',
              }}
            >
              直接編集
            </button>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {mode === 'instruct' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* 指示入力エリア */}
            <div
              style={{
                padding: '16px 24px',
                background: '#fff',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  marginBottom: '8px',
                }}
              >
                編集の指示を入力してください（例: 「Eビザの投資額の目安を40万ドルに変更して」）
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <textarea
                  ref={instructionRef}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={handleInstructionKeyDown}
                  placeholder="指示を入力..."
                  rows={2}
                  disabled={generating}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    fontSize: '14px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                  onBlur={(e) => (e.target.style.borderColor = '#d1d5db')}
                />
                <button
                  onClick={handleGenerate}
                  disabled={!instruction.trim() || generating}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#fff',
                    background:
                      !instruction.trim() || generating
                        ? '#93c5fd'
                        : 'linear-gradient(135deg, #1e40af, #2563eb)',
                    border: 'none',
                    borderRadius: '8px',
                    cursor:
                      !instruction.trim() || generating ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: 'inherit',
                  }}
                >
                  {generating ? '生成中...' : '変更を生成'}
                </button>
              </div>
            </div>

            {/* 結果表示 */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {generating && (
                <div
                  style={{
                    padding: '60px',
                    textAlign: 'center',
                    color: '#6b7280',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: '6px',
                      justifyContent: 'center',
                      marginBottom: '12px',
                    }}
                  >
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: '#94a3b8',
                          animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                  Claudeが変更案を生成しています...
                </div>
              )}

              {editResult && (
                <div>
                  {/* アクションバー */}
                  <div
                    style={{
                      padding: '12px 24px',
                      background: '#eff6ff',
                      borderBottom: '1px solid #bfdbfe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '13px',
                        color: '#1e40af',
                        fontWeight: 600,
                      }}
                    >
                      変更案が生成されました。内容を確認してください。
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={handleDiscard}
                        disabled={saving}
                        style={btnStyle}
                      >
                        やり直す
                      </button>
                      <button
                        onClick={handleApply}
                        disabled={saving}
                        style={{
                          padding: '7px 14px',
                          fontSize: '12px',
                          color: '#fff',
                          background: saving
                            ? '#93c5fd'
                            : 'linear-gradient(135deg, #059669, #10b981)',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: saving ? 'default' : 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {saving ? '適用中...' : '適用する'}
                      </button>
                    </div>
                  </div>
                  {/* Diff */}
                  <DiffView
                    original={editResult.original}
                    modified={editResult.modified}
                  />
                </div>
              )}

              {!generating && !editResult && (
                <div
                  style={{
                    padding: '60px',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '14px',
                  }}
                >
                  編集の指示を入力して「変更を生成」をクリックすると、
                  <br />
                  Claudeが変更案を作成し、差分を表示します。
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Raw editor */
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '16px 24px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#9ca3af',
                marginBottom: '8px',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>backend/system_prompt.md</span>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span>
                  {lineCount} 行 / {rawContent.length} 文字
                  {rawHasChanges && ' (未保存)'}
                </span>
                <button
                  onClick={() => { setRawContent(savedContent); setMessage(null) }}
                  disabled={!rawHasChanges}
                  style={{
                    ...btnStyle,
                    color: rawHasChanges ? '#6b7280' : '#d1d5db',
                  }}
                >
                  リセット
                </button>
                <button
                  onClick={handleRawSave}
                  disabled={!rawHasChanges || saving}
                  style={{
                    padding: '5px 12px',
                    fontSize: '12px',
                    color: '#fff',
                    background:
                      rawHasChanges && !saving
                        ? 'linear-gradient(135deg, #1e40af, #2563eb)'
                        : '#93c5fd',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: rawHasChanges && !saving ? 'pointer' : 'default',
                    fontWeight: 600,
                  }}
                >
                  {saving ? '保存中...' : '保存 (Ctrl+S)'}
                </button>
              </div>
            </div>
            {loadingRaw ? (
              <div
                style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: '#9ca3af',
                }}
              >
                読み込み中...
              </div>
            ) : (
              <textarea
                value={rawContent}
                onChange={(e) => {
                  setRawContent(e.target.value)
                  setMessage(null)
                }}
                spellCheck={false}
                style={{
                  flex: 1,
                  minHeight: 'calc(100vh - 160px)',
                  padding: '16px',
                  fontSize: '13px',
                  fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                  lineHeight: 1.6,
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  outline: 'none',
                  resize: 'none',
                  background: '#fff',
                  color: '#1f2937',
                  boxSizing: 'border-box',
                  tabSize: 2,
                }}
                onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
                onBlur={(e) => (e.target.style.borderColor = '#d1d5db')}
              />
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}

const btnStyle = {
  padding: '7px 14px',
  fontSize: '12px',
  color: '#6b7280',
  background: '#f3f4f6',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 500,
}

const tabBtnStyle = {
  padding: '6px 14px',
  fontSize: '12px',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
}
