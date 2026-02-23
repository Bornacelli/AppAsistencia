// Generic styled input / select for reuse
export function Inp({ label, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
          {label}
        </label>
      )}
      <input
        className={`w-full rounded-[10px] px-4 py-3 text-sm font-medium outline-none transition-colors ${className}`}
        style={{
          background: 'var(--surface)',
          border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
          color: 'var(--text)',
          fontFamily: 'inherit',
        }}
        onFocus={e => { e.target.style.borderColor = error ? 'var(--red)' : 'var(--accent)' }}
        onBlur={e  => { e.target.style.borderColor = error ? 'var(--red)' : 'var(--border)' }}
        {...props}
      />
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  )
}

export function Sel({ label, error, children, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
          {label}
        </label>
      )}
      <select
        className={`w-full rounded-[10px] px-4 py-3 text-sm font-medium outline-none transition-colors ${className}`}
        style={{
          background: 'var(--surface)',
          border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
          color: 'var(--text)',
          fontFamily: 'inherit',
        }}
        onFocus={e => { e.target.style.borderColor = error ? 'var(--red)' : 'var(--accent)' }}
        onBlur={e  => { e.target.style.borderColor = error ? 'var(--red)' : 'var(--border)' }}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  )
}

export function Textarea({ label, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
          {label}
        </label>
      )}
      <textarea
        className={`w-full rounded-[10px] px-4 py-3 text-sm font-medium outline-none transition-colors resize-none ${className}`}
        style={{
          background: 'var(--surface)',
          border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
          color: 'var(--text)',
          fontFamily: 'inherit',
        }}
        onFocus={e => { e.target.style.borderColor = error ? 'var(--red)' : 'var(--accent)' }}
        onBlur={e  => { e.target.style.borderColor = error ? 'var(--red)' : 'var(--border)' }}
        {...props}
      />
      {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  )
}
