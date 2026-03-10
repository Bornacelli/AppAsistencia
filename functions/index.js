import { onSchedule }   from 'firebase-functions/v2/scheduler'
import { onRequest }     from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getMessaging }  from 'firebase-admin/messaging'

initializeApp()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMemberGroupIds(member) {
  if (Array.isArray(member.groupIds) && member.groupIds.length > 0) return member.groupIds
  if (member.groupId) return [member.groupId]
  return []
}

function memberBelongsToGroups(member, groupIds) {
  return getMemberGroupIds(member).some(g => groupIds.includes(g))
}

/** Devuelve true si el MM-DD del cumpleaños cae en el rango [lunes, domingo] de esta semana. */
function hasBirthdayThisWeek(birthDate, monday, sunday) {
  if (!birthDate) return false
  const mmdd = birthDate.slice(5) // "MM-DD"
  const mon  = monday.toISOString().slice(5, 10)
  const sun  = sunday.toISOString().slice(5, 10)
  // Rango normal (no cruza año nuevo)
  if (mon <= sun) return mmdd >= mon && mmdd <= sun
  // Rango que cruza año nuevo (ej. Dec 30 – Jan 5)
  return mmdd >= mon || mmdd <= sun
}

/** Comprueba si un miembro tiene X faltas consecutivas según los registros de asistencia. */
function hasConsecutiveAbsences(member, attDocs, absenceWeeks) {
  const mGroups  = getMemberGroupIds(member)
  const relevant = attDocs.filter(r => {
    if (r.groupId && mGroups.length > 0 && !mGroups.includes(r.groupId)) return false
    return member.id in (r.records || {})
  })
  if (relevant.length < absenceWeeks) return false
  return relevant.slice(0, absenceWeeks).every(r => {
    const st = r.records[member.id]
    return !st || st === 'absent'
  })
}

/** Limpia tokens FCM inválidos del documento del líder. */
async function removeStaleTokens(db, leaderId, staleTokens) {
  if (!staleTokens.length) return
  await db.doc(`leaders/${leaderId}`).update({
    fcmTokens: FieldValue.arrayRemove(...staleTokens),
  })
}

/** Envía una notificación multicast y limpia tokens caducados. */
async function sendAndClean(fcm, db, leaderId, tokens, message) {
  if (!tokens.length) return
  console.log(`Enviando noti a líder ${leaderId}, tokens: ${tokens.length}, título: "${message.data?.title}"`)
  try {
    const result = await fcm.sendEachForMulticast({ ...message, tokens })
    console.log(`Resultado FCM: ${result.successCount} éxitos, ${result.failureCount} fallos`)
    const stale  = []
    result.responses.forEach((r, i) => {
      if (!r.success) {
        console.error(`Token[${i}] falló:`, r.error?.code, r.error?.message)
        const code = r.error?.code || ''
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token') {
          stale.push(tokens[i])
        }
      }
    })
    await removeStaleTokens(db, leaderId, stale)
  } catch (e) {
    console.error(`Error enviando noti a líder ${leaderId}:`, e)
  }
}

// ─── Función programada: todos los lunes a las 9 AM ──────────────────────────
// Cambia timeZone si tu iglesia está en otra zona horaria.
export const weeklyNotifications = onSchedule(
  { schedule: '0 9 * * 1', timeZone: 'America/Bogota' },
  async () => {
    const db  = getFirestore()
    const fcm = getMessaging()

    console.log('=== weeklyNotifications iniciando ===')

    // Configuración
    const cfgSnap      = await db.doc('config/general').get()
    const absenceWeeks = cfgSnap.data()?.absenceAlertWeeks || 2
    console.log('absenceWeeks:', absenceWeeks)

    // Líderes activos con al menos un token FCM
    const leadersSnap = await db.collection('leaders').get()
    const allLeaders  = leadersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    console.log('líderes totales:', allLeaders.length)
    const leaders = allLeaders.filter(l => l.active !== false && l.fcmTokens?.length > 0)
    console.log('líderes con token FCM:', leaders.length, leaders.map(l => ({ id: l.id, role: l.role, tokens: l.fcmTokens?.length })))

    if (!leaders.length) {
      console.log('Sin líderes con token, terminando.')
      return
    }

    // Todos los miembros activos
    const membersSnap = await db.collection('members').get()
    const allMembers  = membersSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(m => m.active !== false)
    console.log('miembros activos:', allMembers.length)

    // Registros de asistencia, ordenados del más reciente al más antiguo
    const attSnap = await db.collection('attendance').get()
    const allAtt  = attSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    console.log('registros de asistencia:', allAtt.length)

    // Rango "esta semana": lunes (hoy) → domingo
    const now    = new Date()
    const monday = new Date(now)
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    // Procesar cada líder
    for (const leader of leaders) {
      const isAdmin = leader.role === 'super_admin' || leader.role === 'admin'
      const gids    = leader.groupIds || (leader.groupId ? [leader.groupId] : [])

      // Miembros y asistencias filtrados según el rol
      const members = isAdmin
        ? allMembers
        : allMembers.filter(m => memberBelongsToGroups(m, gids))

      const att = isAdmin
        ? allAtt
        : allAtt.filter(r => gids.includes(r.groupId))

      console.log(`Líder ${leader.id} (${leader.role}): ${members.length} miembros, rango cumpleaños ${monday.toISOString().slice(0,10)} – ${sunday.toISOString().slice(0,10)}`)

      // ── Ausencias ──────────────────────────────────────────────────────────
      const absentCount = members.filter(m => hasConsecutiveAbsences(m, att, absenceWeeks)).length
      console.log(`  ausentes consecutivos: ${absentCount}`)

      if (absentCount > 0) {
        const plural = absentCount > 1
        const body   = `${absentCount} persona${plural ? 's llevan' : ' lleva'} ${absenceWeeks} `
                     + `reunión${absenceWeeks > 1 ? 'es' : ''} consecutiva${absenceWeeks > 1 ? 's' : ''} sin asistir`
        await sendAndClean(fcm, db, leader.id, leader.fcmTokens, {
          webpush: {
            headers: { Urgency: 'high' },
            data: { title: '⚠️ Inasistencias', body, url: '/absences', tag: 'absences' },
          },
        })
      }

      // ── Cumpleaños esta semana ─────────────────────────────────────────────
      const bdayMembers = members.filter(m => hasBirthdayThisWeek(m.birthDate, monday, sunday))
      console.log(`  cumpleaños esta semana: ${bdayMembers.length}`, bdayMembers.map(m => ({ name: m.fullName, bd: m.birthDate })))

      if (bdayMembers.length > 0) {
        const bdayBody = bdayMembers.length <= 4
          ? `Esta semana cumplen años: ${bdayMembers.map(m => m.fullName).join(', ')}`
          : `${bdayMembers.length} personas cumplen años esta semana`

        await sendAndClean(fcm, db, leader.id, leader.fcmTokens, {
          webpush: {
            headers: { Urgency: 'high' },
            data: { title: '🎂 Cumpleaños esta semana', body: bdayBody, url: '/birthdays', tag: 'birthdays' },
          },
        })
      }
    }
  }
)

// ─── HTTP de prueba: envía push a todos los tokens guardados ─────────────────
// Llamar desde el navegador: https://<region>-<project>.cloudfunctions.net/testPush
export const testPush = onRequest({ cors: true }, async (req, res) => {
  const db  = getFirestore()
  const fcm = getMessaging()

  const snap    = await db.collection('leaders').get()
  const leaders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  const tokens  = leaders.flatMap(l => l.fcmTokens || [])

  if (!tokens.length) {
    res.json({ error: 'Sin tokens FCM en Firestore' })
    return
  }

  const result = await fcm.sendEachForMulticast({
    tokens,
    webpush: {
      headers: { Urgency: 'high' },
      data: { title: '🔔 Test Push', body: 'Si ves esto, FCM funciona ✅', url: '/', tag: 'test' },
    },
  })

  res.json({
    tokens: tokens.length,
    success: result.successCount,
    failure: result.failureCount,
    details: result.responses.map((r, i) => ({
      token:   tokens[i].slice(0, 30) + '...',
      success: r.success,
      error:   r.error?.code ?? null,
    })),
  })
})
