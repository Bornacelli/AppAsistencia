import { useNavigate } from 'react-router-dom'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { Bell, Cake, Warning, Handshake, WhatsappLogo, X, ArrowRight } from '@phosphor-icons/react'
import { useAlerts } from '../context/AlertContext'

export default function Alerts() {
  const navigate = useNavigate()
  const { visibleAlerts, loading, dismissAlert, dismissAll } = useAlerts()

  const typeConfig = {
    birthday: { icon: Cake,      color: 'var(--amber)',  bg: 'var(--amber-bg)',              bdr: 'var(--amber-bdr)',              title: 'Cumpleaños' },
    absence:  { icon: Warning,   color: 'var(--red)',    bg: 'var(--red-bg)',                 bdr: 'var(--red-bdr)',                title: 'Inasistencias' },
    visitor:  { icon: Handshake, color: 'var(--accent)', bg: 'rgba(59,130,246,0.08)',         bdr: 'rgba(59,130,246,0.2)',          title: 'Seguimiento visitantes' },
  }

  const grouped = visibleAlerts.reduce((acc, a) => {
    if (!acc[a.type]) acc[a.type] = []
    acc[a.type].push(a)
    return acc
  }, {})

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="font-syne font-extrabold text-[17px]" style={{ color: 'var(--text)' }}>Alertas</h1>
        {visibleAlerts.length > 0 && (
          <span className="w-6 h-6 rounded-full text-[11px] font-extrabold flex items-center justify-center"
            style={{ background: 'var(--red)', color: 'white' }}>{visibleAlerts.length}</span>
        )}
      </div>

      <div className="px-4 py-4 flex flex-col gap-5">
        {loading ? <LoadingSpinner /> : visibleAlerts.length === 0 ? (
          <EmptyState icon={Bell} title="Sin alertas activas" description="Todo está al día. ¡Buen trabajo!" />
        ) : (
          <>
            {/* Shortcuts */}
            <div className="flex flex-col gap-2">
              <button onClick={() => navigate('/birthdays')}
                className="flex items-center gap-3 px-4 py-3 rounded-[12px] press"
                style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber-bdr)' }}>
                <Cake size={18} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--amber)' }}>Ver gestión de cumpleaños</span>
                <ArrowRight size={16} style={{ color: 'var(--amber)' }} />
              </button>
              <button onClick={() => navigate('/absences')}
                className="flex items-center gap-3 px-4 py-3 rounded-[12px] press"
                style={{ background: 'var(--red-bg)', border: '1px solid var(--red-bdr)' }}>
                <Warning size={18} style={{ color: 'var(--red)', flexShrink: 0 }} />
                <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--red)' }}>Ver gestión de inasistencias</span>
                <ArrowRight size={16} style={{ color: 'var(--red)' }} />
              </button>
            </div>

            {Object.entries(grouped).map(([type, items]) => {
              const cfg = typeConfig[type]
              if (!cfg) return null
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <cfg.icon size={16} style={{ color: cfg.color }} />
                      <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: cfg.color }}>
                        {cfg.title} ({items.length})
                      </p>
                    </div>
                    <button
                      onClick={() => dismissAll(items.map(a => a.alertKey))}
                      className="text-[10px] font-bold press"
                      style={{ color: 'var(--text-3)' }}>
                      Ignorar todas
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-[12px]"
                        style={{ background: cfg.bg, border: `1px solid ${cfg.bdr}` }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{a.name?.toUpperCase()}</p>
                          <p className="text-xs mt-0.5" style={{ color: cfg.color }}>{a.label}</p>
                        </div>
                        {a.phone && (
                          <a
                            href={`https://wa.me/${a.phone.replace(/\D/g, '')}${a.isToday ? `?text=${encodeURIComponent(`¡Feliz cumpleaños ${a.name.split(' ')[0]}! 🎉 El grupo te desea un día increíble.`)}` : ''}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 px-3 py-1.5 rounded-[8px] text-xs font-bold flex-shrink-0 press"
                            style={{ background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-bdr)' }}>
                            <WhatsappLogo size={14} />
                            WA
                          </a>
                        )}
                        <button
                          onClick={() => dismissAlert(a.alertKey)}
                          className="w-7 h-7 flex items-center justify-center rounded-[7px] flex-shrink-0 press"
                          style={{ background: 'rgba(0,0,0,0.15)', color: cfg.color }}
                          title="Marcar como leída">
                          <X size={12} weight="bold" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
