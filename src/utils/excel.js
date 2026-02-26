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
  const headers = ['Fecha', 'Total Miembros', 'Presentes', 'Ausentes', '% Asistencia']
  const rows = records.map(r => {
    const total   = members.length
    const present = Object.values(r.records || {}).filter(v => v === 'present' || v === 'late').length
    const absent  = Object.values(r.records || {}).filter(v => v === 'absent').length
    const pct     = total > 0 ? `${Math.round((present / total) * 100)}%` : '0%'
    return [r.date, total, present, absent, pct]
  })

  const totals = ['TOTALES', members.length, '', '',
    rows.length > 0 ? `${Math.round(rows.reduce((a, r) => a + parseInt(r[4]), 0) / rows.length)}%` : '0%'
  ]

  exportToExcel(`Asistencia_${groupName}_${dateRange}`, `Asistencia ${groupName}`, headers, rows, totals)
}

// Export member attendance history
export function exportMemberHistory(member, records) {
  const headers = ['Fecha', 'Estado']
  const statusLabel = { present: 'Presente', absent: 'Ausente', late: 'Presente' }
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
  const headers = ['#', 'Nombre', 'Total Reuniones', 'Presentes', '% Asistencia']
  const rows = ranking.map((r, i) => [i + 1, r.name, r.total, r.present + (r.late || 0), `${r.pct}%`])
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

// Generate import template for members
export function generateMembersTemplate(groups) {
  const wb = XLSX.utils.book_new()
  const headers = [
    'Nombre completo *',
    'Nombre corto',
    'Teléfono',
    'Dirección',
    'Fecha nacimiento (YYYY-MM-DD)',
    'Fecha ingreso (YYYY-MM-DD)',
    'Estado espiritual',
    'Grupo',
    'Invitado por',
  ]
  const groupNames = groups.map(g => g.name).join(', ') || 'Nombre del Grupo'
  const sampleGroup = groups.length > 0 ? groups[0].name : 'Grupo Ejemplo'
  const sample = [
    'Juan Pérez García', 'Juancho', '50312345678', 'San Salvador',
    '1995-03-15', '2024-01-10', 'Nuevo', sampleGroup, 'María López',
  ]
  const info = [
    '← Campo obligatorio', '', '', '', 'Formato: YYYY-MM-DD', 'Formato: YYYY-MM-DD',
    'Nuevo | En seguimiento | Consolidado | Miembro | Líder',
    `Grupos disponibles: ${groupNames}`,
    '',
  ]
  const ws = XLSX.utils.aoa_to_sheet([headers, sample, info])
  ws['!cols'] = [
    { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 22 },
    { wch: 26 }, { wch: 24 }, { wch: 22 }, { wch: 22 }, { wch: 20 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
  XLSX.writeFile(wb, 'Plantilla_Miembros.xlsx')
}

// Normalize a date value coming from SheetJS to YYYY-MM-DD string.
// Handles: JS Date objects (from Excel date cells), "DD/MM/YYYY" strings,
// "YYYY-MM-DD" strings, and Excel serial numbers.
function normalizeDate(raw) {
  if (!raw && raw !== 0) return ''

  // JS Date object (SheetJS returns these for formatted date cells)
  if (raw instanceof Date) {
    const y = raw.getFullYear()
    const m = String(raw.getMonth() + 1).padStart(2, '0')
    const d = String(raw.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // Excel serial number (numeric)
  if (typeof raw === 'number') {
    const date = new Date(Math.round((raw - 25569) * 86400 * 1000))
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const str = String(raw).trim()
  if (!str) return ''

  // DD/MM/YYYY or D/M/YYYY (Excel text format common in Latin America)
  const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // YYYY-MM-DD — already correct
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str

  return '' // unrecognized format → ignore
}

// Parse members from an imported Excel file
export function parseMembersFromExcel(file, groups) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        const statusMap = {
          'nuevo': 'new',
          'en seguimiento': 'following',
          'consolidado': 'consolidated',
          'miembro': 'member',
          'líder': 'leader',
          'lider': 'leader',
        }

        const members = []
        // Start at row 1 to skip headers; skip row 2 if it's the sample/info row
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          const fullName = String(row[0] || '').trim()
          if (!fullName || fullName === '← Campo obligatorio') continue

          const rawStatus = String(row[6] || '').trim().toLowerCase()
          const spiritualStatus = statusMap[rawStatus] || 'new'

          const rawGroup = String(row[7] || '').trim().toLowerCase()
          const group = groups.find(g => g.name.toLowerCase() === rawGroup)

          members.push({
            fullName,
            shortName:      String(row[1] || '').trim(),
            phone:          String(row[2] || '').trim(),
            address:        String(row[3] || '').trim(),
            birthDate:      normalizeDate(row[4]),
            joinDate:       normalizeDate(row[5]),
            spiritualStatus,
            groupId:        group?.id || '',
            referredBy:     String(row[8] || '').trim(),
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

// Export attendees of a specific meeting
export function exportMeetingAttendeesList(record, members, groupName = '') {
  const statusLabel = { present: 'Presente', absent: 'Ausente', late: 'Presente' }
  const recs = record.records || {}
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
  // Sort: present first, then absent
  rows.sort((a, b) => (a[1] === 'Presente' ? 0 : 1) - (b[1] === 'Presente' ? 0 : 1))
  const label = groupName ? `${groupName}_${record.date}` : record.date
  exportToExcel(`Asistentes_${label}`, `Reunión ${record.date}`, headers, rows)
}
