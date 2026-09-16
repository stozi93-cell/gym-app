import { useEffect, useRef, useState } from "react";
import { correctionValues } from "../billing/invoiceValues.mjs";
import ScrollArea from "./ui/ScrollArea";

function dateLabel(value) {
  if (!value) return "-";
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("sr-Latn-RS");
}

export default function InvoiceEditor({ invoice, onSave, onClose }) {
  const dialog = useRef(null);
  const savingRef = useRef(false);
  const [amount, setAmount] = useState(String(invoice.amount ?? 0));
  const [paidAmount, setPaidAmount] = useState(String(invoice.paidAmount ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (savingRef.current) return;
    setError("");
    try {
      correctionValues(invoice, { amount, paidAmount });
      savingRef.current = true;
      setSaving(true);
      await onSave({ amount, paidAmount });
    } catch (failure) {
      setError(failure.code
        ? "Izmena nije sačuvana. Proverite vezu i pokušajte ponovo."
        : failure.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const inputClass = "mt-1 w-full min-w-0 rounded-lg border border-white/15 bg-neutral-800 px-3 py-2.5 text-base text-white outline-none focus:border-blue-400";
  return (
    <dialog
      ref={dialog}
      aria-labelledby="invoice-editor-title"
      onCancel={(event) => { event.preventDefault(); if (!savingRef.current) onClose(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-lg border border-white/15 bg-neutral-900 p-0 text-white shadow-xl backdrop:bg-black/70"
    >
      <form onSubmit={submit} className="flex max-h-[90dvh] flex-col">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 id="invoice-editor-title" className="text-lg font-semibold">Izmeni fakturu</h2>
          <p className="mt-1 break-words text-sm text-neutral-300">{invoice.clientName} · {invoice.subscriptionName}</p>
          {invoice.membership && (
            <p className="mt-1 text-xs text-neutral-400">
              {dateLabel(invoice.membership.startDate)} - {dateLabel(invoice.membership.endDate)}
            </p>
          )}
        </div>
        <ScrollArea containerClassName="min-h-0 flex-1" className="h-full space-y-4 px-4 py-4">
          <fieldset disabled={saving} className="space-y-3 disabled:opacity-60">
            <label className="block text-sm text-neutral-300">
              Cena (RSD)
              <input autoFocus inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} />
            </label>
            <label className="block text-sm text-neutral-300">
              Evidentirana uplata (RSD)
              <input inputMode="decimal" required value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} className={inputClass} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPaidAmount("0")} className="min-h-11 rounded-lg border border-red-400/30 px-2 py-2 text-sm text-red-300">Poništi uplatu</button>
              <button type="button" onClick={() => setPaidAmount(amount)} className="min-h-11 rounded-lg border border-green-400/30 px-2 py-2 text-sm text-green-300">Plaćeno u celosti</button>
            </div>
          </fieldset>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        </ScrollArea>
        <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
          <button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-lg px-3 py-2 text-sm text-neutral-300 disabled:opacity-50">Odustani</button>
          <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Čuvanje..." : "Sačuvaj"}</button>
        </div>
      </form>
    </dialog>
  );
}
