export function formatMessageTime(timestamp) {
  return timestamp?.toDate?.().toLocaleTimeString("sr-RS", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getDayKey(timestamp) {
  return timestamp?.toDate?.().toISOString().slice(0, 10) || "";
}

export function formatDayLabel(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) return "";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const dayKey = date.toDateString();
  if (dayKey === today.toDateString()) return "Danas";
  if (dayKey === yesterday.toDateString()) return "Juče";

  return date.toLocaleDateString("sr-RS", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function getMessageStatus(message) {
  if (message.readAt) return "Pročitano";
  if (message.deliveredAt) return "Primljeno";
  return "Poslato";
}
