import * as XLSX from 'xlsx'

// Color constants for Excel styling
const HEADER_FILL = { fgColor: { rgb: '1E3A5F' } }
const HEADER_FONT = { color: { rgb: 'F0F4FF' }, bold: true, name: 'Calibri', sz: 11 }
const ALT_FILL    = { fgColor: { rgb: '0E1520' } }
const BORDER = {
  top:    { style: 'thin', color: { rgb: '3D4F6B' } },
  bottom: { style: 'thin', color: { rgb: '3D4F6B' } },
  left:   { style: 'thin', color: { rgb: '3D4F6B' } },
  right:  { style: 'thin', color: { rgb: '3D4F6B' } },
}

function makeCell(value, bold = false, fill = null, align = 'left') {
  return {
    v: value,
    t: typeof value === 'number' ? 'n' : 's',
    s: {
      font: { name: 'Calibri', sz: 10, bold, color: { rgb: 'F0F4FF' } },
      fill: fill || { fgColor: { rgb: '131D2E' } },
      border: BORDER,
      alignment: { horizontal: align, vertical: 'center', wrapText: true },
    },
  }
}

function makeHeader(value) {
  return { ...makeCell(value, true, HEADER_FILL, 'center'), s: { font: HEADER_FONT, fill: HEADER_FILL, border: BORDER, alignment: { horizontal: 'center', vertical: 'center' } } }
}

// Export generic table
export function exportToExcel(filename, sheetName, headers, rows, totals = null) {
  const wb = XLSX.utils.book_new()
  const ws = {}

  // Headers row
  headers.forEach((h, i) => {
    ws[XLSX.utils.encode_cell({ r: 0, c: i })] = makeHeader(h)
  })

  // Data rows
  rows.forEach((row, ri) => {
    const fill = ri % 2 === 1 ? { fgColor: { rgb: '0E1520' } } : { fgColor: { rgb: '131D2E' } }
    row.forEach((cell, ci) => {
      ws[XLSX.utils.encode_cell({ r: ri + 1, c: ci })] = makeCell(cell, false, fill, ci === 0 ? 'left' : 'center')
    })
  })

  // Totals row
  if (totals) {
    const tr = rows.length + 1
    totals.forEach((cell, ci) => {
      ws[XLSX.utils.encode_cell({ r: tr, c: ci })] = makeCell(cell, true, { fgColor: { rgb: '1E3A5F' } }, ci === 0 ? 'left' : 'center')
    })
  }

  const lastRow = rows.length + (totals ? 2 : 1)
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: headers.length - 1 } })
  ws['!cols'] = headers.map(() => ({ wch: 18 }))
  ws['!rows'] = [{ hpt: 24 }]

  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// Export attendance report
export function exportAttendanceReport(records, members, groupName, dateRange) {
  const headers = ['Fecha', 'Total Miembros', 'Presentes', 'Ausentes', 'Tardanzas', '% Asistencia']
  const rows = records.map(r => {
    const total    = members.length
    const present  = Object.values(r.records || {}).filter(v => v === 'present').length
    const absent   = Object.values(r.records || {}).filter(v => v === 'absent').length
    const late     = Object.values(r.records || {}).filter(v => v === 'late').length
    const pct      = total > 0 ? `${Math.round((present / total) * 100)}%` : '0%'
    return [r.date, total, present, absent, late, pct]
  })

  const totals = ['TOTALES', members.length, '', '', '',
    rows.length > 0 ? `${Math.round(rows.reduce((a, r) => a + parseInt(r[5]), 0) / rows.length)}%` : '0%'
  ]

  exportToExcel(`Asistencia_${groupName}_${dateRange}`, `Asistencia ${groupName}`, headers, rows, totals)
}

// Export member attendance history
export function exportMemberHistory(member, records) {
  const headers = ['Fecha', 'Estado']
  const statusLabel = { present: 'Presente', absent: 'Ausente', late: 'Tardanza' }
  const rows = records.map(r => [r.date, statusLabel[r.status] || 'Sin registro'])
  const present = rows.filter(r => r[1] === 'Presente').length
  const totals = [`Total: ${rows.length} reuniones`, `Asistió: ${present} (${rows.length > 0 ? Math.round((present / rows.length) * 100) : 0}%)`]
  exportToExcel(`Historial_${member.fullName.replace(/\s+/g, '_')}`, member.fullName, headers, rows, totals)
}

// Export visitors report
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
  exportToExcel('Visitantes', 'Visitantes', headers, rows)
}

// Export ranking
export function exportRankingReport(ranking) {
  const headers = ['#', 'Nombre', 'Total Reuniones', 'Presentes', 'Tardanzas', '% Asistencia']
  const rows = ranking.map((r, i) => [i + 1, r.name, r.total, r.present, r.late, `${r.pct}%`])
  exportToExcel('Ranking_Asistencia', 'Ranking', headers, rows)
}

// Export detailed member list for a group (or all)
export function exportMembersList(members, groupName = 'Todos') {
  const statusLabel = { new: 'Nuevo', following: 'En seguimiento', consolidated: 'Consolidado', member: 'Miembro', leader: 'Líder' }
  const headers = ['Nombre', 'Nombre corto', 'Teléfono', 'Dirección', 'Fecha nacimiento', 'Fecha ingreso', 'Estado espiritual', 'Grupo', 'Invitado por']
  const rows = members.map(m => [
    m.fullName || '',
    m.shortName || '',
    m.phone || '',
    m.address || '',
    m.birthDate || '',
    m.joinDate || '',
    statusLabel[m.spiritualStatus] || m.spiritualStatus || '',
    m._groupName || '',
    m.referredBy || '',
  ])
  const filename = groupName === 'Todos' ? 'Lista_Personas_Total' : `Lista_Personas_${groupName.replace(/\s+/g, '_')}`
  exportToExcel(filename, `Personas - ${groupName}`, headers, rows)
}

// Export attendees of a specific meeting
export function exportMeetingAttendeesList(record, members, groupName = '') {
  const statusLabel = { present: 'Presente', absent: 'Ausente', late: 'Tardanza' }
  const recs = record.records || {}
  // Get all member ids that appear in the record
  const allIds = new Set([
    ...members.map(m => m.id),
    ...Object.keys(recs),
  ])
  const headers = ['Nombre', 'Estado', 'Teléfono']
  const rows = []
  allIds.forEach(id => {
    const member = members.find(m => m.id === id)
    const status = recs[id] || 'absent'
    rows.push([
      member?.fullName || 'Persona externa',
      statusLabel[status] || status,
      member?.phone || '',
    ])
  })
  // Sort: present first, then late, then absent
  const order = { present: 0, late: 1, absent: 2 }
  rows.sort((a, b) => (order[a[1] === 'Presente' ? 'present' : a[1] === 'Tardanza' ? 'late' : 'absent'] || 0) -
    (order[b[1] === 'Presente' ? 'present' : b[1] === 'Tardanza' ? 'late' : 'absent'] || 0))
  const label = groupName ? `${groupName}_${record.date}` : record.date
  exportToExcel(`Asistentes_${label}`, `Reunión ${record.date}`, headers, rows)
}
