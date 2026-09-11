export function selectInitialBookingDay({
  todayKey,
  days,
  slotsByDay,
  hasUserBooking,
  isBookable,
}) {
  const isRelevantDay = (dayKey) => {
    const daySlots = slotsByDay[dayKey] || [];
    return hasUserBooking(daySlots) || daySlots.some(isBookable);
  };

  if (isRelevantDay(todayKey)) return todayKey;
  return (
    days.find((day) => day.key !== todayKey && isRelevantDay(day.key))?.key ||
    todayKey
  );
}
