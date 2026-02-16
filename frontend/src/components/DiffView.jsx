import { useMemo } from 'react'

/**
 * 簡易LCSベースのline diff
 */
function computeDiff(oldText, newText) {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  // LCS table
  const m = oldLines.length
  const n = newLines.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to build diff
  const result = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'equal', content: oldLines[i - 1], oldLine: i, newLine: j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', content: newLines[j - 1], newLine: j })
      j--
    } else {
      result.unshift({ type: 'remove', content: oldLines[i - 1], oldLine: i })
      i--
    }
  }

  return result
}

/**
 * 変更のあるチャンク周辺のみ表示（コンテキスト行数指定）
 */
function getVisibleChunks(diff, contextLines = 3) {
  const changed = new Set()
  diff.forEach((line, idx) => {
    if (line.type !== 'equal') changed.add(idx)
  })
  if (changed.size === 0) return []

  const visible = new Set()
  changed.forEach((idx) => {
    for (let c = Math.max(0, idx - contextLines); c <= Math.min(diff.length - 1, idx + contextLines); c++) {
      visible.add(c)
    }
  })

  const chunks = []
  let current = []
  const sortedIndices = [...visible].sort((a, b) => a - b)

  sortedIndices.forEach((idx, i) => {
    if (i > 0 && idx - sortedIndices[i - 1] > 1) {
      chunks.push(current)
      current = []
    }
    current.push({ ...diff[idx], index: idx })
  })
  if (current.length > 0) chunks.push(current)

  return chunks
}

const STYLES = {
  add: { background: '#dcfce7', color: '#166534' },
  remove: { background: '#fee2e2', color: '#991b1b', textDecoration: 'line-through' },
  equal: { background: 'transparent', color: '#6b7280' },
}

export default function DiffView({ original, modified }) {
  const { diff, chunks, stats } = useMemo(() => {
    const d = computeDiff(original, modified)
    const c = getVisibleChunks(d)
    const added = d.filter((l) => l.type === 'add').length
    const removed = d.filter((l) => l.type === 'remove').length
    return { diff: d, chunks: c, stats: { added, removed } }
  }, [original, modified])

  if (stats.added === 0 && stats.removed === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
        変更はありません
      </div>
    )
  }

  return (
    <div>
      <div
        style={{
          padding: '8px 16px',
          fontSize: '12px',
          color: '#6b7280',
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          gap: '16px',
        }}
      >
        <span style={{ color: '#166534' }}>+{stats.added} 追加</span>
        <span style={{ color: '#991b1b' }}>-{stats.removed} 削除</span>
      </div>
      <div
        style={{
          fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
          fontSize: '12px',
          lineHeight: 1.6,
          overflowX: 'auto',
        }}
      >
        {chunks.map((chunk, ci) => (
          <div key={ci}>
            {ci > 0 && (
              <div
                style={{
                  padding: '4px 16px',
                  background: '#f3f4f6',
                  color: '#9ca3af',
                  fontSize: '11px',
                  borderTop: '1px solid #e5e7eb',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                ・・・
              </div>
            )}
            {chunk.map((line, li) => (
              <div
                key={`${ci}-${li}`}
                style={{
                  padding: '1px 16px 1px 8px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  ...STYLES[line.type],
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '20px',
                    textAlign: 'right',
                    marginRight: '12px',
                    color: '#9ca3af',
                    userSelect: 'none',
                    fontSize: '11px',
                  }}
                >
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </span>
                {line.content || ' '}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
