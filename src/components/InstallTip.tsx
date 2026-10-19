import { useEffect, useState } from 'react'
import { Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const TIP_KEY = 'jianzhi-install-tip-dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const media = window.matchMedia('(display-mode: standalone)').matches
  const ios = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return media || ios
}

export function InstallTip() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (isStandalone()) return
      if (localStorage.getItem(TIP_KEY) === '1') return
      setShow(true)
    } catch {
      /* ignore */
    }
  }, [])

  if (!show) return null

  return (
    <div className="mb-3 rounded-2xl border border-navy/25 bg-navy/8 px-3 py-3">
      <div className="flex items-start gap-2">
        <Share className="mt-0.5 size-4 shrink-0 text-navy" />
        <p className="flex-1 text-sm leading-snug text-[var(--fg)]">
          用 Safari 打开 → 分享 → 添加到主屏幕；装好后可离线用。记录保存在本机，不依赖登录。
        </p>
        <button
          type="button"
          className="rounded-lg p-1 text-[var(--muted)]"
          aria-label="关闭提示"
          onClick={() => {
            try {
              localStorage.setItem(TIP_KEY, '1')
            } catch {
              /* ignore */
            }
            setShow(false)
          }}
        >
          <X className="size-4" />
        </button>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 w-full"
        onClick={() => {
          try {
            localStorage.setItem(TIP_KEY, '1')
          } catch {
            /* ignore */
          }
          setShow(false)
        }}
      >
        知道了
      </Button>
    </div>
  )
}
