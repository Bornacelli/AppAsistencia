import { CheckCircle, WarningCircle, Info, XCircle } from '@phosphor-icons/react'
import { useToast } from '../../context/ToastContext'

const configs = {
  ok:    { icon: CheckCircle,    color: 'var(--green)' },
  warn:  { icon: WarningCircle,  color: 'var(--amber)' },
  info:  { icon: Info,           color: 'var(--accent)' },
  error: { icon: XCircle,        color: 'var(--red)' },
}

export default function Toast() {
  const { toasts } = useToast()

  return (
    <div className="fixed bottom-24 left-0 right-0 z-[200] flex flex-col items-center gap-2 pointer-events-none px-4">
      {toasts.map(t => {
        const { icon: Icon, color } = configs[t.type] || configs.info
        return (
          <div
            key={t.id}
            className="animate-slide-up flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold shadow-base pointer-events-auto"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <Icon size={16} weight="fill" style={{ color, flexShrink: 0 }} />
            <span>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
