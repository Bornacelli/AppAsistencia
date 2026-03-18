import * as XLSX from 'xlsx-js-style'
import { getAge, getAgeRange } from './members'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  headerBg:   '8DB4E2',   // Azul claro — cabeceras
  headerFg:   'FFFFFF',
  rowEven:    'FFFFFF',   // Blanco — filas pares
  rowOdd:     'EFF6FF',   // Azul muy claro — filas impares
  rowFg:      '1E293B',   // Casi negro — texto datos
  totalBg:    'DBEAFE',   // Azul pastel — fila totales
  totalFg:    '1D4ED8',   // Azul — texto totales
  border:     'BFDBFE',   // Azul suave — bordes
  font:       'Calibri',
}

function bdr() {
  const s = { style: 'thin', color: { rgb: C.border } }
  return { top: s, bottom: s, left: s, right: s }
}

function cell(v, { bold = false, bg = C.rowEven, fg = C.rowFg, align = 'left', sz = 10, italic = false } = {}) {
  return {
    v: v ?? '',
    t: typeof v === 'number' ? 'n' : 's',
    s: {
      font:      { name: C.font, sz, bold, italic, color: { rgb: fg } },
      fill:      { fgColor: { rgb: bg } },
      border:    bdr(),
      alignment: { horizontal: align, vertical: 'center', wrapText: false },
    },
  }
}

const headerCell = v => cell(v, { bold: true, bg: C.headerBg, fg: C.headerFg, align: 'center', sz: 11 })
const totalCell  = (v, a = 'center') => cell(v, { bold: true, bg: C.totalBg, fg: C.totalFg, align: a, sz: 10 })
const dataCell   = (v, ri, align = 'left') => cell(v, { bg: ri % 2 === 0 ? C.rowEven : C.rowOdd, align })

// ─── Core builder ─────────────────────────────────────────────────────────────
// row 0: cabeceras · row 1+: datos · última: totales
function buildSheet(title, headers, rows, totals = null, colWidths = null) {
  const ws = {}
  const N  = headers.length
  let   r  = 0

  // Cabeceras
  headers.forEach((h, c) => { ws[XLSX.utils.encode_cell({ r, c })] = headerCell(h) })
  r++

  // Datos
  rows.forEach((row, ri) => {
    row.forEach((val, c) => {
      ws[XLSX.utils.encode_cell({ r, c })] = dataCell(val, ri, c === 0 ? 'left' : 'center')
    })
    r++
  })

  // Totales
  if (totals) {
    totals.forEach((val, c) => { ws[XLSX.utils.encode_cell({ r, c })] = totalCell(val, c === 0 ? 'left' : 'center') })
    r++
  }

  ws['!ref']  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: N - 1 } })
  ws['!cols'] = colWidths ? colWidths.map(wch => ({ wch })) : headers.map(() => ({ wch: 20 }))
  ws['!rows'] = [
    { hpt: 24 },
    ...rows.map(() => ({ hpt: 18 })),
    ...(totals ? [{ hpt: 22 }] : []),
  ]
  return ws
}

// ─── Generic export (usado por funciones externas si hace falta) ───────────────
export function exportToExcel(filename, sheetName, headers, rows, totals = null, colWidths = null) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildSheet(sheetName, headers, rows, totals, colWidths), sheetName.slice(0, 31))
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ─── Reporte de asistencia por período ────────────────────────────────────────
export function exportAttendanceReport(records, members, groupName, dateRange) {
  const headers = ['Fecha', 'Total Miembros', 'Presentes', 'Ausentes', '% Asistencia']
  const rows = records.map(r => {
    const eligibleIds = new Set(members.filter(m => m.active !== false && (!m.joinDate || m.joinDate <= r.date)).map(m => m.id))
    const total   = eligibleIds.size
    const present = Object.entries(r.records || {}).filter(([id, v]) => eligibleIds.has(id) && (v === 'present' || v === 'late')).length
    const absent  = Object.entries(r.records || {}).filter(([id, v]) => eligibleIds.has(id) && v === 'absent').length
    const pct     = total > 0 ? `${Math.round((present / total) * 100)}%` : '0%'
    return [r.date, total, present, absent, pct]
  })
  const avg = rows.length > 0 ? `${Math.round(rows.reduce((a, r) => a + parseInt(r[4]), 0) / rows.length)}%` : '0%'
  const totals = ['TOTALES', members.length, '', '', avg]
  exportToExcel(
    `Asistencia_${groupName}_${dateRange}`,
    `Asistencia — ${groupName}`,
    headers, rows, totals,
    [16, 18, 16, 16, 16],
  )
}

// ─── Historial de asistencia de un miembro ────────────────────────────────────
export function exportMemberHistory(member, records) {
  const statusLabel = { present: 'Presente', absent: 'Ausente', late: 'Presente' }
  const headers = ['Fecha', 'Estado']
  const rows    = records.map(r => [r.date, statusLabel[r.status] || 'Sin registro'])
  const present = rows.filter(r => r[1] === 'Presente').length
  const totals  = [
    `Total: ${rows.length} reuniones`,
    `Asistió: ${present} (${rows.length > 0 ? Math.round((present / rows.length) * 100) : 0}%)`,
  ]
  exportToExcel(
    `Historial_${member.fullName.replace(/\s+/g, '_')}`,
    member.fullName,
    headers, rows, totals,
    [18, 16],
  )
}

// ─── Visitantes ───────────────────────────────────────────────────────────────
export function exportVisitorsReport(visitors) {
  const statusLabel = { visitor: 'Visitante', following: 'En seguimiento', converted: 'Consolidado' }
  const headers = ['Nombre', 'Teléfono', 'Referido por', 'Primera visita', 'Estado', 'Notas']
  const rows = visitors.map(v => [
    v.name,
    v.phone || '',
    v.referredBy || '',
    v.firstVisitDate || '',
    statusLabel[v.status] || v.status,
    (v.notes || []).length,
  ])
  exportToExcel('Visitantes', 'Visitantes', headers, rows, null, [28, 16, 24, 16, 20, 10])
}

// ─── Ranking de asistencia ────────────────────────────────────────────────────
export function exportRankingReport(ranking) {
  const headers = ['#', 'Nombre', 'Total Reuniones', 'Asistencias', '% Asistencia']
  const rows = ranking.map((r, i) => [i + 1, r.name, r.total, r.present, `${r.pct}%`])
  exportToExcel('Ranking_Asistencia', 'Ranking de Asistencia', headers, rows, null, [6, 30, 18, 16, 16])
}

// ─── Ranking de invitaciones ──────────────────────────────────────────────────
export function exportInvitationRanking(ranking, groupName = 'Todos') {
  const headers = ['#', 'Nombre', 'Personas invitadas', 'Quiénes']
  const rows = ranking.map((r, i) => [
    i + 1,
    r.name,
    r.count,
    r.invited.map(m => m.fullName).join(', '),
  ])
  exportToExcel(
    `Ranking_Invitaciones_${groupName}`,
    `Ranking de Invitaciones — ${groupName}`,
    headers, rows, null,
    [6, 28, 18, 50],
  )
}

// ─── Lista de personas ────────────────────────────────────────────────────────
const SEX_LABEL = { male: 'Masculino', female: 'Femenino' }

export function exportMembersList(members, groupName = 'Todos', ageRanges = []) {
  const statusLabel = { new: 'Nuevo', following: 'En seguimiento', consolidated: 'Consolidado', member: 'Miembro', leader: 'Líder' }
  const headers = ['Nombre', 'Sexo', 'Edad', 'Rango de edad', 'Teléfono', 'Dirección', 'F. Nacimiento', 'F. Ingreso', 'Estado espiritual', 'Grupo', 'Invitado por']
  const rows = members.map(m => {
    const age   = getAge(m.birthDate)
    const range = getAgeRange(m.birthDate, ageRanges)
    return [
      m.fullName  || '',
      SEX_LABEL[m.sex] || '',
      age !== null ? age : '',
      range?.name || '',
      m.phone     || '',
      m.address   || '',
      m.birthDate || '',
      m.joinDate  || '',
      statusLabel[m.spiritualStatus] || m.spiritualStatus || '',
      m._groupName || '',
      m.referredBy || '',
    ]
  })
  const filename = groupName === 'Todos' ? 'Lista_Personas_Total' : `Lista_Personas_${groupName.replace(/\s+/g, '_')}`
  exportToExcel(filename, `Personas — ${groupName}`, headers, rows, null, [30, 10, 8, 18, 16, 24, 14, 14, 20, 20, 24])
}

// ─── Clasificación por rangos de edad ────────────────────────────────────────
export function exportAgeRangeList(members, ageRanges, groupName = 'Todos') {
  const headers = ['Nombre', 'Sexo', 'Edad', 'Teléfono', 'F. Nacimiento']
  const wb = XLSX.utils.book_new()
  const rangesWithFallback = [...ageRanges, { name: 'Sin clasificar', _special: true }]
  rangesWithFallback.forEach(range => {
    const rangeMembers = range._special
      ? members.filter(m => !getAgeRange(m.birthDate, ageRanges))
      : members.filter(m => getAgeRange(m.birthDate, ageRanges)?.name === range.name)
    if (rangeMembers.length === 0) return
    const rows = rangeMembers
      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'es'))
      .map(m => [
        m.fullName       || '',
        SEX_LABEL[m.sex] || '',
        getAge(m.birthDate) ?? '',
        m.phone          || '',
        m.birthDate      || '',
      ])
    const sheetName = range.name.slice(0, 31)
    XLSX.utils.book_append_sheet(wb, buildSheet(sheetName, headers, rows, null, [30, 10, 8, 16, 14]), sheetName)
  })
  if (wb.SheetNames.length === 0) return
  const filename = groupName === 'Todos' ? 'Clasificacion_Edades' : `Clasificacion_Edades_${groupName.replace(/\s+/g, '_')}`
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ─── Plantilla de importación ─────────────────────────────────────────────────
export function generateMembersTemplate(groups) {
  const wb      = XLSX.utils.book_new()
  const ws      = {}
  const headers = ['Nombre completo *', 'Teléfono', 'Dirección', 'Fecha nacimiento (YYYY-MM-DD)', 'Fecha ingreso (YYYY-MM-DD)', 'Estado espiritual', 'Grupo', 'Invitado por']
  const N       = headers.length

  const groupNames  = groups.map(g => g.name).join(', ') || 'Nombre del Grupo'
  const sampleGroup = groups.length > 0 ? groups[0].name : 'Grupo Ejemplo'
  const sample      = ['Juan Pérez García', '50312345678', 'San Salvador', '1995-03-15', '2024-01-10', 'Nuevo', sampleGroup, 'María López']
  const info        = ['← Obligatorio', '', '', 'Formato: YYYY-MM-DD', 'Formato: YYYY-MM-DD', 'Nuevo | En seguimiento | Consolidado | Miembro | Líder', `Grupos: ${groupNames}`, '']

  // Cabeceras
  headers.forEach((h, c) => { ws[XLSX.utils.encode_cell({ r: 0, c })] = headerCell(h) })

  // Fila de ejemplo — fondo verde muy suave
  sample.forEach((v, c) => {
    ws[XLSX.utils.encode_cell({ r: 1, c })] = cell(v, { bg: 'F0FDF4', fg: '14532D', align: c === 0 ? 'left' : 'center' })
  })

  // Fila de instrucciones — gris claro, itálica
  info.forEach((v, c) => {
    ws[XLSX.utils.encode_cell({ r: 2, c })] = cell(v, { bg: 'F8FAFC', fg: '64748B', italic: true, align: c === 0 ? 'left' : 'center' })
  })

  ws['!ref']  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 2, c: N - 1 } })
  ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 22 }, { wch: 28 }, { wch: 26 }, { wch: 24 }, { wch: 22 }, { wch: 22 }]
  ws['!rows'] = [{ hpt: 24 }, { hpt: 18 }, { hpt: 18 }]

  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
  XLSX.writeFile(wb, 'Plantilla_Miembros.xlsx')
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function normalizeDate(raw) {
  if (!raw && raw !== 0) return ''
  if (raw instanceof Date) {
    const y = raw.getFullYear()
    const m = String(raw.getMonth() + 1).padStart(2, '0')
    const d = String(raw.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof raw === 'number') {
    const date = new Date(Math.round((raw - 25569) * 86400 * 1000))
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const str = String(raw).trim()
  if (!str) return ''
  const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  return ''
}

function norm(str) {
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function cellStr(raw) {
  if (raw === null || raw === undefined) return ''
  if (raw instanceof Date) return ''
  return String(raw).trim()
}

// ─── Importar personas desde Excel ────────────────────────────────────────────
export function parseMembersFromExcel(file, groups) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        const statusMap = {
          'nuevo':          'new',
          'en seguimiento': 'following',
          'consolidado':    'consolidated',
          'miembro':        'member',
          'lider':          'leader',
          'visitante':      'visitor',
        }

        const members = []
        for (let i = 1; i < rows.length; i++) {
          const row      = rows[i]
          const fullName = cellStr(row[0])
          if (!fullName || fullName === '← Obligatorio' || fullName === '← Campo obligatorio') continue

          const spiritualStatus = statusMap[norm(row[5])] || 'new'
          const rawGroup        = norm(row[6])
          const group           = groups.find(g => norm(g.name) === rawGroup)

          members.push({
            fullName,
            phone:          cellStr(row[1]),
            address:        cellStr(row[2]),
            birthDate:      normalizeDate(row[3]),
            joinDate:       normalizeDate(row[4]),
            spiritualStatus,
            groupId:        group?.id || '',
            referredBy:     cellStr(row[7]),
            active:         true,
            createdAt:      new Date().toISOString(),
          })
        }
        resolve(members)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// ─── Asistentes de una reunión específica ─────────────────────────────────────
export function exportMeetingAttendeesList(record, groupMembers, allMembers, groupName = '') {
  const recs        = record.records || {}
  const statusLabel = { new: 'Nuevo', following: 'En seguimiento', consolidated: 'Consolidado', member: 'Miembro', leader: 'Líder' }

  const eligible       = groupMembers.filter(m => !m.joinDate || m.joinDate <= record.date)
  const eligibleIds    = new Set(eligible.map(m => m.id))
  const groupMemberIds = new Set(groupMembers.map(m => m.id))

  const headers = ['Nombre', 'Teléfono', 'Dirección', 'Estado espiritual', 'Invitado por']
  const rows    = []

  eligible
    .filter(m => recs[m.id] === 'present' || recs[m.id] === 'late')
    .forEach(m => {
      rows.push([
        m.fullName || '',
        m.phone    || '',
        m.address  || '',
        statusLabel[m.spiritualStatus] || m.spiritualStatus || '',
        m.referredBy || '',
      ])
    })

  Object.keys(recs).forEach(id => {
    if (eligibleIds.has(id) || groupMemberIds.has(id)) return
    if (recs[id] !== 'present' && recs[id] !== 'late') return
    const member = allMembers.find(m => m.id === id)
    if (!member) return
    rows.push([
      `${member.fullName} (${member._groupName})`,
      member.phone   || '',
      member.address || '',
      statusLabel[member.spiritualStatus] || member.spiritualStatus || '',
      member.referredBy || '',
    ])
  })

  rows.sort((a, b) => (a[0] || '').localeCompare(b[0] || ''))
  const label = groupName ? `${groupName}_${record.date}` : record.date
  exportToExcel(
    `Asistentes_${label}`,
    `Asistentes — ${groupName || 'Reunión'} · ${record.date}`,
    headers, rows, null,
    [30, 16, 24, 20, 24],
  )
}
