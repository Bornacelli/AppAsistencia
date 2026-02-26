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
