export default function LoadingSpinner({ fullScreen = false, size = 44, label = 'Cargando' }) {
  if (fullScreen) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 min-h-dvh"
        style={{ background: 'var(--bg)' }}
      >
        <div
          className="rounded-full border-[3px] animate-spin-slow"
          style={{
            width: size,
            height: size,
            borderColor: 'var(--border)',
            borderTopColor: 'var(--accent)',
          }}
        />
        {label && (
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--text-2)' }}>
            {label}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-12">
      <div
        className="rounded-full border-[3px] animate-spin-slow"
        style={{
          width: size * 0.75,
          height: size * 0.75,
          borderColor: 'var(--border)',
          borderTopColor: 'var(--accent)',
        }}
      />
    </div>
  )
}
