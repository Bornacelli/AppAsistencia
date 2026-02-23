import { X } from '@phosphor-icons/react'
import { useEffect } from 'react'

export default function Modal({ open, onClose, title, children, maxWidth = '480px' }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="w-full animate-slide-up rounded-t-[24px] sm:rounded-[20px] overflow-hidden"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          maxWidth,
          maxHeight: '90dvh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="font-syne font-extrabold text-lg" style={{ color: 'var(--text)' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-[10px] press"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-5">
          {children}
        </div>
      </div>
    </div>
  )
}
