import { Component, type ErrorInfo, type ReactNode } from 'react'
import { exportRawStorage } from '@/lib/storage'

type Props = { children: ReactNode }
type State = { error: Error | null }

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

async function shareOrDownload(text: string) {
  const filename = `减脂笔记-恢复-${new Date().toISOString().slice(0, 10)}.json`
  try {
    const file = new File([text], filename, { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: '减脂笔记备份' })
      return
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
  }
  downloadText(filename, text)
}

async function reloadApp() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.update().catch(() => undefined)))
    }
  } catch {
    /* ignore */
  }
  window.location.reload()
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('减脂笔记 crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const message = this.state.error.message || String(this.state.error)
    return (
      <div
        style={{
          minHeight: '100dvh',
          padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
          background: '#f4f1ea',
          color: '#1c2833',
          fontFamily:
            'PingFang SC, Hiragino Sans GB, Noto Sans SC, system-ui, sans-serif',
        }}
      >
        <p style={{ margin: 0, fontSize: 12, color: '#6d655b' }}>减脂笔记</p>
        <h1 style={{ margin: '6px 0 12px', fontSize: 22 }}>页面出错了</h1>
        <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.5 }}>
          本机数据还在，没有清空。请先导出备份，再点重新加载。若仍白屏，把备份文件发给开发者。
        </p>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: '#fffcf7',
            border: '1px solid #e4ddd2',
            borderRadius: 12,
            padding: 12,
            fontSize: 12,
            color: '#c0392b',
          }}
        >
          {message}
        </pre>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => {
              try {
                void shareOrDownload(exportRawStorage())
              } catch (err) {
                window.alert(err instanceof Error ? err.message : '导出失败')
              }
            }}
            style={{
              height: 48,
              border: 0,
              borderRadius: 12,
              background: '#1b4f72',
              color: '#fff',
              fontSize: 16,
            }}
          >
            导出数据
          </button>
          <button
            type="button"
            onClick={() => void reloadApp()}
            style={{
              height: 48,
              border: '1px solid #e4ddd2',
              borderRadius: 12,
              background: '#fffcf7',
              color: '#1c2833',
              fontSize: 16,
            }}
          >
            重新加载
          </button>
        </div>
      </div>
    )
  }
}
