/**
 * Returns the effective list of group IDs for a member,
 * supporting both the legacy `groupId` (string) and new `groupIds` (array) fields.
 */
export function getMemberGroupIds(member) {
  if (member?.groupIds?.length > 0) return member.groupIds
  if (member?.groupId) return [member.groupId]
  return []
}

/**
 * Returns true if the member belongs to the given groupId.
 */
export function memberInGroup(member, groupId) {
  return getMemberGroupIds(member).includes(groupId)
}

/**
 * Returns true if the member belongs to ANY of the given groupIds.
 */
export function memberInAnyGroup(member, groupIds) {
  const ids = getMemberGroupIds(member)
  return groupIds.some(gid => ids.includes(gid))
}

/**
 * Calcula las estadísticas de asistencia de una reunión de forma centralizada.
 * - Solo cuenta miembros activos del grupo con joinDate <= fecha de la reunión.
 * - Cuenta 'present' y 'late' como asistencia (compatibilidad con datos viejos).
 * @param {object} record   — documento de attendance { date, groupId, records }
 * @param {Array}  members  — lista completa de miembros (sin filtrar)
 * @returns {{ total: number, present: number, pct: number }}
 */
export function meetingStats(record, members) {
  const eligible = members.filter(m =>
    m.active !== false &&
    (!record.groupId || memberInGroup(m, record.groupId)) &&
    (!m.joinDate || m.joinDate <= record.date)
  )
  const eligibleIds = new Set(eligible.map(m => m.id))
  const present = Object.entries(record.records || {})
    .filter(([id, v]) => eligibleIds.has(id) && (v === 'present' || v === 'late'))
    .length
  const total = eligible.length
  const pct   = total > 0 ? Math.round((present / total) * 100) : 0
  return { total, present, pct }
}
