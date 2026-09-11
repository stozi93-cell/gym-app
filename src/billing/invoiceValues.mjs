export function money(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) {
    throw new Error("Unesite ispravan iznos, sa najviše dve decimale.");
  }
  const cents = Math.round(Number(text.replace(",", ".")) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("Iznos je prevelik.");
  return cents / 100;
}

export function invoiceValues(invoice) {
  return {
    amount: invoice.amount ?? 0,
    paidAmount: invoice.paidAmount ?? 0,
    status: invoice.status ?? "pending",
    paidAt: invoice.paidAt ?? null,
  };
}

function timestampKey(value) {
  if (!value) return null;
  if (value.seconds != null) return `${value.seconds}:${value.nanoseconds}`;
  return new Date(value).getTime();
}

export function assertUnchanged(current, expected) {
  const a = invoiceValues(current);
  const b = invoiceValues(expected);
  if (
    a.amount !== b.amount || a.paidAmount !== b.paidAmount ||
    a.status !== b.status || timestampKey(a.paidAt) !== timestampKey(b.paidAt) ||
    (current.billingRevision ?? 0) !== (expected.billingRevision ?? 0)
  ) {
    throw new Error("Faktura je u međuvremenu promenjena. Zatvorite izmenu i proverite nove podatke.");
  }
}

export function correctionValues(current, changes) {
  const amount = money(changes.amount);
  const paidAmount = money(changes.paidAmount);
  if (paidAmount > amount) {
    throw new Error("Evidentirana uplata ne može biti veća od cene. Proverite oba iznosa.");
  }
  return {
    amount,
    paidAmount,
    status: current.status === "cancelled" ? "cancelled"
      : paidAmount === amount ? "paid" : paidAmount > 0 ? "partially_paid" : "pending",
    // A correction does not move a historical payment into today's income.
    paidAt: paidAmount > 0 ? current.paidAt ?? null : null,
  };
}
