import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { auth, db } from "../firebase";
import InvoiceEditor from "../components/InvoiceEditor";
import { updateInvoice } from "../billing/updateInvoice.mjs";
import { Panel } from "../components/ui/Primitives";

const INITIAL_LIMIT = 3;
const STATUS_FILTERS = [
  { value: "all", label: "Sve" },
  { value: "pending", label: "Na čekanju" },
  { value: "partially_paid", label: "Delimično" },
  { value: "paid", label: "Plaćeno" },
  { value: "cancelled", label: "Otkazano" },
];

function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  return new Date(value);
}

function formatDate(value) {
  const date = toDate(value);
  return date
    ? date.toLocaleDateString("sr-Latn-RS", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "-";
}

function formatShortDate(value) {
  const date = toDate(value);
  return date
    ? date.toLocaleDateString("sr-Latn-RS", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "-";
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseInputDate(value, endOfDay = false) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
}

function attachMembershipPeriods(invoices, memberships) {
  const membershipsById = Object.fromEntries(
    memberships.map((membership) => [membership.id, membership])
  );
  const resolved = [];
  const legacyInvoices = [];

  invoices.forEach((invoice) => {
    const membership = membershipsById[invoice.clientSubscriptionId];
    if (membership) {
      resolved.push({ ...invoice, membership, exactMembershipLink: true });
    } else {
      legacyInvoices.push(invoice);
    }
  });

  const groups = new Map();
  legacyInvoices.forEach((invoice) => {
    const key = `${invoice.clientId}|${invoice.subscriptionId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(invoice);
  });

  groups.forEach((groupInvoices, key) => {
    const [clientId, subscriptionId] = key.split("|");
    const matchingMemberships = memberships
      .filter(
        (membership) =>
          membership.userId === clientId &&
          membership.subscriptionId === subscriptionId
      )
      .sort((a, b) => toDate(a.startDate) - toDate(b.startDate));

    groupInvoices
      .sort((a, b) => (toDate(a.createdAt) || 0) - (toDate(b.createdAt) || 0))
      .forEach((invoice, index) => {
        resolved.push({
          ...invoice,
          membership: matchingMemberships[index] || null,
          exactMembershipLink: false,
        });
      });
  });

  return resolved.sort(
    (a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0)
  );
}

export default function AdminBilling() {
  const [rawInvoices, setRawInvoices] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [searchClient, setSearchClient] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [overviewStart, setOverviewStart] = useState("");
  const [overviewEnd, setOverviewEnd] = useState("");
  const [status, setStatus] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [pendingInvoice, setPendingInvoice] = useState(null);

  useEffect(() => {
    return onSnapshot(collection(db, "billing"), (snap) => {
      setRawInvoices(
        snap.docs.map((invoice) => ({
          id: invoice.id,
          ...invoice.data(),
        }))
      );
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "clientSubscriptions"), (snap) => {
      setMemberships(
        snap.docs.map((membership) => ({
          id: membership.id,
          ...membership.data(),
        }))
      );
    });
  }, []);

  const invoices = useMemo(
    () => attachMembershipPeriods(rawInvoices, memberships),
    [rawInvoices, memberships]
  );

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const matchesClient = (invoice.clientName || "")
        .toLowerCase()
        .includes(searchClient.toLowerCase());
      const matchesStatus =
        filterStatus === "all" || invoice.status === filterStatus;
      return matchesClient && matchesStatus;
    });
  }, [invoices, searchClient, filterStatus]);

  const overviewInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      if (invoice.status !== "paid" && invoice.status !== "partially_paid") {
        return false;
      }

      const paidAt = toDate(invoice.paidAt);
      if (!paidAt) return false;

      const start = parseInputDate(overviewStart);
      const end = parseInputDate(overviewEnd, true);
      if (start && paidAt < start) return false;
      if (end && paidAt > end) return false;

      return true;
    });
  }, [invoices, overviewStart, overviewEnd]);

  const overviewTotal = overviewInvoices.reduce(
    (sum, invoice) => sum + (invoice.paidAmount || 0),
    0
  );
  const pendingTotal = filteredInvoices.reduce((sum, invoice) => {
    if (invoice.status === "paid" || invoice.status === "cancelled") return sum;
    return sum + Math.max(0, (invoice.amount || 0) - (invoice.paidAmount || 0));
  }, 0);
  const visibleInvoices = showAll
    ? filteredInvoices
    : filteredInvoices.slice(0, INITIAL_LIMIT);

  function showStatus(type, message) {
    setStatus({ type, message });
    window.setTimeout(() => setStatus(null), 3500);
  }

  async function handlePartialPayment(invoice) {
    if (pendingInvoice) return;
    const max = invoice.amount - (invoice.paidAmount || 0);
    const input = prompt(`Unesite iznos (maks ${max} RSD):`);
    if (!input) return;

    const paid = Number(input);
    if (Number.isNaN(paid) || paid <= 0 || paid > max) {
      showStatus("error", "Uneti iznos nije ispravan.");
      return;
    }

    setPendingInvoice(invoice.id);
    try {
      await updateInvoice(db, invoice.id, invoice, { type: "payment", amount: paid }, auth.currentUser?.uid);
      showStatus("success", "Uplata je sačuvana.");
    } catch (error) {
      console.error("Payment save failed", error);
      showStatus("error", error.code ? "Uplata nije sačuvana. Pokušaj ponovo." : error.message);
    } finally {
      setPendingInvoice(null);
    }
  }

  async function handleCancel(invoice) {
    if (pendingInvoice) return;
    if (!window.confirm("Otkaži fakturu?")) return;

    setPendingInvoice(invoice.id);
    try {
      await updateInvoice(db, invoice.id, invoice, { type: "cancel" }, auth.currentUser?.uid);
      showStatus("success", "Faktura je otkazana.");
    } catch (error) {
      console.error("Invoice cancel failed", error);
      showStatus("error", error.code ? "Faktura nije otkazana. Pokušaj ponovo." : error.message);
    } finally {
      setPendingInvoice(null);
    }
  }

  async function handleCorrection(changes) {
    await updateInvoice(db, editingInvoice.id, editingInvoice, { type: "correction", ...changes }, auth.currentUser?.uid);
    setEditingInvoice(null);
    showStatus("success", "Cena i uplata su sačuvane.");
  }

  function applyOverviewPreset(preset) {
    const now = new Date();
    let start;
    let end;

    if (preset === "today") {
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
    }

    if (preset === "week") {
      const day = now.getDay() || 7;
      start = new Date(now);
      start.setDate(now.getDate() - day + 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    }

    if (preset === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    if (preset === "lastMonth") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    }

    if (!start || !end) return;
    setOverviewStart(toInputDate(start));
    setOverviewEnd(toInputDate(end));
  }

  return (
    <div className="space-y-3">
      {status && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            status.type === "success"
              ? "border-brand-green-500/20 bg-brand-green-500/10 text-brand-green-300"
              : "border-red-400/20 bg-red-500/10 text-red-300"
          }`}
        >
          {status.message}
        </div>
      )}

      <Panel className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-brand-green-500/20 bg-brand-green-500/10 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand-green-300">
              Naplaćeno
            </p>
            <p className="mt-1 text-lg font-semibold text-white">
              {overviewTotal} RSD
            </p>
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-amber-200">
              Preostalo
            </p>
            <p className="mt-1 text-lg font-semibold text-white">
              {pendingTotal} RSD
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1">
          <PresetButton onClick={() => applyOverviewPreset("today")}>Danas</PresetButton>
          <PresetButton onClick={() => applyOverviewPreset("week")}>Ova nedelja</PresetButton>
          <PresetButton onClick={() => applyOverviewPreset("month")}>Ovaj mesec</PresetButton>
          <PresetButton onClick={() => applyOverviewPreset("lastMonth")}>Prošli mesec</PresetButton>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0 text-xs text-neutral-400">
            Od
            <input
              type="date"
              value={overviewStart}
              onChange={(event) => setOverviewStart(event.target.value)}
              placeholder="Početni datum"
              className="mt-1 w-full min-w-0 rounded-xl border border-white/10 bg-neutral-950/60 px-2 py-2 text-sm text-white outline-none focus:border-brand-blue-500"
            />
          </label>
          <label className="min-w-0 text-xs text-neutral-400">
            Do
            <input
              type="date"
              value={overviewEnd}
              onChange={(event) => setOverviewEnd(event.target.value)}
              placeholder="Krajnji datum"
              className="mt-1 w-full min-w-0 rounded-xl border border-white/10 bg-neutral-950/60 px-2 py-2 text-sm text-white outline-none focus:border-brand-blue-500"
            />
          </label>
        </div>
      </Panel>

      <Panel className="space-y-2 p-3">
        <input
          placeholder="Pretraga klijenta"
          value={searchClient}
          onChange={(event) => setSearchClient(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-4 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500"
        />

        <div className="grid grid-cols-5 gap-1">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilterStatus(option.value)}
              className={`min-w-0 rounded-lg border px-1 py-1.5 text-[9px] font-medium leading-tight transition sm:text-[11px] ${
                filterStatus === option.value
                  ? "border-brand-blue-500 bg-brand-blue-500 text-white shadow-glow"
                  : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Panel>

      <div className="space-y-2">
        {visibleInvoices.map((invoice) => (
          <InvoiceCard
            key={invoice.id}
            invoice={invoice}
            onPayment={() => handlePartialPayment(invoice)}
            onCancel={() => handleCancel(invoice)}
            onEdit={() => setEditingInvoice(invoice)}
            disabled={Boolean(pendingInvoice)}
          />
        ))}
        {!visibleInvoices.length && (
          <p className="px-4 text-sm text-neutral-400">Nema rezultata.</p>
        )}
      </div>

      {filteredInvoices.length > INITIAL_LIMIT && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-brand-blue-300"
        >
          {showAll ? "Prikaži manje" : "Prikaži sve"}
        </button>
      )}

      {editingInvoice && <InvoiceEditor key={editingInvoice.id} invoice={editingInvoice} onSave={handleCorrection} onClose={() => setEditingInvoice(null)} />}
    </div>
  );
}

function InvoiceCard({ invoice, onPayment, onCancel, onEdit, disabled }) {
  const meta = {
    pending: { label: "Na čekanju", color: "border border-red-400/25 bg-red-500/10 text-red-300" },
    partially_paid: { label: "Delimično plaćeno", color: "border border-amber-400/25 bg-amber-400/10 text-amber-200" },
    paid: { label: "Plaćeno", color: "border border-brand-green-500/25 bg-brand-green-500/10 text-brand-green-300" },
    cancelled: { label: "Otkazano", color: "border border-white/10 bg-white/5 text-neutral-400" },
  }[invoice.status] || { label: invoice.status, color: "border border-white/10 bg-white/5 text-neutral-300" };

  const statusDate =
    invoice.paidAt &&
    (invoice.status === "paid" || invoice.status === "partially_paid")
      ? ` · ${formatShortDate(invoice.paidAt)}`
      : "";

  return (
    <Panel className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link to={`/profil/${invoice.clientId}`} className="block truncate text-sm font-semibold text-white">
            {invoice.clientName || "-"}
          </Link>
          <p className="mt-0.5 truncate text-xs text-neutral-400">
            {invoice.subscriptionName || "-"}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-white">
            {invoice.paidAmount || 0} / {invoice.amount || 0}
          </p>
          <p className="text-[10px] uppercase tracking-[0.08em] text-neutral-500">
            RSD
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        {invoice.membership ? (
          <p className="min-w-0 truncate text-xs text-neutral-400">
            {formatDate(invoice.membership.startDate)} - {formatDate(invoice.membership.endDate)}
          </p>
        ) : (
          <p className="min-w-0 truncate text-xs text-amber-300">
            Period članarine nije povezan.
          </p>
        )}

        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.color}`}>
          {meta.label}{statusDate}
        </span>
      </div>

      {invoice.status !== "paid" && invoice.status !== "cancelled" && (
        <div className="flex gap-2 pt-1">
          <button disabled={disabled} onClick={onPayment} className="flex-1 rounded-xl bg-brand-blue-500 py-2 text-xs font-semibold text-white shadow-glow disabled:opacity-50">Uplata</button>
          <button disabled={disabled} onClick={onCancel} className="flex-1 rounded-xl border border-red-400/25 bg-red-500/10 py-2 text-xs font-semibold text-red-300 disabled:opacity-50">Otkaži</button>
        </div>
      )}
      <button type="button" disabled={disabled} onClick={onEdit} className="min-h-11 w-full rounded-lg border border-white/15 px-3 py-2 text-sm text-neutral-200 disabled:opacity-50">Izmeni fakturu</button>
    </Panel>
  );
}

function PresetButton({ children, onClick }) {
  return (
    <button onClick={onClick} className="min-w-0 rounded-lg border border-white/10 bg-white/5 px-1 py-2 text-[9px] font-medium leading-tight text-white transition hover:bg-white/10 sm:text-[11px]">
      {children}
    </button>
  );
}
