export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center gap-3">
      {Icon && <Icon size={44} style={{ color: 'var(--text-3)' }} />}
      <p className="font-bold text-sm" style={{ color: 'var(--text-2)' }}>{title}</p>
      {description && (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
