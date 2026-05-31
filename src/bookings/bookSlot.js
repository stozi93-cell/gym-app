import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

const callBookSlot = httpsCallable(functions, "bookSlot");

export function getTemplateSlotId(templateId, timestamp) {
  return `tpl_${templateId}_${timestamp.getTime()}`;
}

export async function bookSlot({
  slot,
  userId,
  allowOverbook = false,
  adminOverride = false,
}) {
  const result = await callBookSlot({
    slotId: slot.generated ? null : slot.id,
    templateId: slot.templateId || slot.createdFromTemplate || null,
    timestampMillis: slot.timestamp.getTime(),
    userId,
    allowOverbook,
    adminOverride,
  });

  return result.data;
}

export function getBookingErrorMessage(error) {
  return error?.message || "Rezervacija nije uspela. Pokusajte ponovo.";
}
