// Reusable button variants
export default function Btn({ variant = 'primary', size = 'md', icon: Icon, children, className = '', ...props }) {
  const sizes = {
    sm: 'h-9 px-4 text-xs gap-1.5',
    md: 'h-11 px-5 text-sm gap-2',
    lg: 'h-14 px-6 text-[15px] gap-2',
  }

  const base = `inline-flex items-center justify-center font-bold rounded-[var(--r)] transition-all press cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed w-full ${sizes[size]} ${className}`

  const variants = {
    primary: {
      style: { background: 'var(--accent-g)', color: 'white', boxShadow: '0 4px 20px rgba(59,130,246,0.25)' },
    },
    ghost: {
      style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
    },
    danger: {
      style: { background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-bdr)' },
    },
    warning: {
      style: { background: 'var(--amber)', color: '#08090e' },
    },
    success: {
      style: { background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bdr)' },
    },
  }

  return (
    <button className={base} style={variants[variant]?.style} {...props}>
      {Icon && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 18} weight="bold" />}
      {children}
    </button>
  )
}
