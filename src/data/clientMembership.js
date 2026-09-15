function toDate(value) {
  if (!value) return null;
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getActiveMembership(memberships, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  return memberships
    .map((membership) => ({
      membership,
      start: toDate(membership.startDate),
      end: toDate(membership.endDate),
    }))
    .filter(({ membership, start, end }) => {
      if (membership.active === false || !start || !end) return false;
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      return start <= today && today <= end;
    })
    .sort((a, b) => b.start - a.start)[0]?.membership || null;
}
