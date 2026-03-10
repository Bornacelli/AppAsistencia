import { useNavigate } from 'react-router-dom'
import { Bell, X } from '@phosphor-icons/react'

export default function PushBanner({ notif, onClose }) {
  const navigate = useNavigate()
  if (!notif) return null

  const handleClick = () => {
    onClose()
    if (notif.url && notif.url !== '/') navigate(notif.url)
  }

  return (
    <div
      className="fixed top-4 left-4 right-4 z-[300] animate-slide-from-top"
      style={{ maxWidth: 480, margin: '0 auto' }}
    >
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-2xl shadow-lg cursor-pointer"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        }}
        onClick={handleClick}
      >
        <div
          className="flex-shrink-0 rounded-full flex items-center justify-center mt-0.5"
          style={{ width: 36, height: 36, background: 'var(--accent)', opacity: 0.9 }}
        >
          <Bell size={18} weight="fill" color="#fff" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-snug" style={{ color: 'var(--text)' }}>
            {notif.title}
          </p>
          {notif.body && (
            <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>
              {notif.body}
            </p>
          )}
        </div>

        <button
          className="flex-shrink-0 p-1 rounded-full"
          style={{ color: 'var(--text-secondary)' }}
          onClick={e => { e.stopPropagation(); onClose() }}
        >
          <X size={16} weight="bold" />
        </button>
      </div>
    </div>
  )
}
