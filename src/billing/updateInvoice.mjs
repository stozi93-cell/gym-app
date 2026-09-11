import { arrayUnion, doc, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { assertUnchanged, correctionValues, invoiceValues, money } from "./invoiceValues.mjs";

export async function updateInvoice(db, invoiceId, expected, action, actorId) {
  if (!actorId) throw new Error("Prijavite se ponovo pre izmene fakture.");
  const ref = doc(db, "billing", invoiceId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("Faktura više ne postoji.");
    const current = snapshot.data();
    assertUnchanged(current, expected);
    const before = invoiceValues(current);
    const now = Timestamp.now();
    let after;

    if (action.type === "correction") {
      after = correctionValues(current, action);
      if (after.paidAmount > 0 && !after.paidAt) after.paidAt = now;
    } else if (action.type === "payment") {
      if (current.status === "cancelled") throw new Error("Faktura je otkazana.");
      const payment = money(action.amount);
      if (payment <= 0) throw new Error("Uplata mora biti veća od nule.");
      after = correctionValues(current, {
        amount: current.amount,
        paidAmount: Math.round((money(current.paidAmount ?? 0) + payment) * 100) / 100,
      });
      after.paidAt = now;
    } else if (action.type === "cancel") {
      after = { ...before, status: "cancelled" };
    } else {
      throw new Error("Nepoznata izmena fakture.");
    }

    transaction.update(ref, {
      ...after,
      billingRevision: (current.billingRevision ?? 0) + 1,
      updatedAt: serverTimestamp(),
      updatedBy: actorId,
      adjustmentHistory: arrayUnion({
        type: action.type, before, after, at: now, by: actorId,
      }),
    });
  });
}
