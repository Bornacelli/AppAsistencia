import { ArrowLeft } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'

export default function TopBar({ title, subtitle, onBack, backTo, actions, sticky = true }) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (onBack) onBack()
    else if (backTo) navigate(backTo)
    else navigate(-1)
  }

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 z-10 ${sticky ? 'sticky top-0' : ''}`}
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        paddingTop: 'max(12px, env(safe-area-inset-top))',
      }}
    >
      {(onBack !== false) && (
        <button
          onClick={handleBack}
          className="w-10 h-10 flex items-center justify-center rounded-[10px] flex-shrink-0 press"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
        >
          <ArrowLeft size={20} />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <h1 className="font-syne font-extrabold text-[17px] truncate" style={{ color: 'var(--text)' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-2)' }}>{subtitle}</p>
        )}
      </div>

      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
