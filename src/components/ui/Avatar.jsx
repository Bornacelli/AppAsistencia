function initials(name = '') {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

const statusStyles = {
  present: { bg: 'var(--green-bg)', color: 'var(--green)', border: 'var(--green-bdr)' },
  absent:  { bg: 'var(--red-bg)',   color: 'var(--red)',   border: 'var(--red-bdr)' },
  late:    { bg: 'var(--amber-bg)', color: 'var(--amber)', border: 'var(--amber-bdr)' },
  default: { bg: 'var(--card)',     color: 'var(--text-2)', border: 'var(--border)' },
}

export default function Avatar({ name, size = 40, status, className = '' }) {
  const style = statusStyles[status] || statusStyles.default
  return (
    <div
      className={`flex items-center justify-center rounded-full text-xs font-extrabold flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        fontSize: size * 0.32,
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {initials(name)}
    </div>
  )
}
