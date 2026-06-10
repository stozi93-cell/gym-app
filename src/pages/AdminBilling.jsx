import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../firebase";

const INITIAL_LIMIT = 1;

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
  const visibleInvoices = showAll
    ? filteredInvoices
    : filteredInvoices.slice(0, INITIAL_LIMIT);

  function showStatus(type, message) {
    setStatus({ type, message });
    window.setTimeout(() => setStatus(null), 3500);
  }

  async function handlePartialPayment(invoice) {
    const max = invoice.amount - (invoice.paidAmount || 0);
    const input = prompt(`Unesite iznos (maks ${max} RSD):`);
    if (!input) return;

    const paid = Number(input);
    if (Number.isNaN(paid) || paid <= 0 || paid > max) {
      showStatus("error", "Uneti iznos nije ispravan.");
      return;
    }

    const newPaid = (invoice.paidAmount || 0) + paid;
    try {
      await updateDoc(doc(db, "billing", invoice.id), {
        paidAmount: newPaid,
        status: newPaid === invoice.amount ? "paid" : "partially_paid",
        paidAt: new Date(),
      });
      showStatus("success", "Uplata je sačuvana.");
    } catch (error) {
      console.error("Payment save failed", error);
      showStatus("error", "Uplata nije sačuvana. Pokušaj ponovo.");
    }
  }

  async function handleCancel(invoice) {
    if (!window.confirm("Otkaži fakturu?")) return;

    try {
      await updateDoc(doc(db, "billing", invoice.id), {
        status: "cancelled",
      });
      showStatus("success", "Faktura je otkazana.");
    } catch (error) {
      console.error("Invoice cancel failed", error);
      showStatus("error", "Faktura nije otkazana. Pokušaj ponovo.");
    }
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
    <div className="space-y-6 px-2 py-1">
      {status && (
        <div
          className={`mx-2 rounded-lg px-3 py-2 text-sm ${
            status.type === "success"
              ? "bg-green-950/70 text-green-300"
              : "bg-red-950/70 text-red-300"
          }`}
        >
          {status.message}
        </div>
      )}

      <div className="mx-2 space-y-3 rounded-xl bg-neutral-900 p-4">
        <input
          placeholder="Pretraga klijenta"
          value={searchClient}
          onChange={(event) => setSearchClient(event.target.value)}
          className="w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        />
        <select
          value={filterStatus}
          onChange={(event) => setFilterStatus(event.target.value)}
          className="w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        >
          <option value="all">Sve</option>
          <option value="pending">Na čekanju</option>
          <option value="partially_paid">Delimično plaćeno</option>
          <option value="paid">Plaćeno</option>
          <option value="cancelled">Otkazano</option>
        </select>
      </div>

      <div className="space-y-3">
        {visibleInvoices.map((invoice) => (
          <InvoiceCard
            key={invoice.id}
            invoice={invoice}
            onPayment={() => handlePartialPayment(invoice)}
            onCancel={() => handleCancel(invoice)}
          />
        ))}
        {!visibleInvoices.length && (
          <p className="px-4 text-sm text-neutral-400">Nema rezultata.</p>
        )}
      </div>

      {filteredInvoices.length > INITIAL_LIMIT && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mx-2 text-sm text-blue-400"
        >
          {showAll ? "Prikaži manje" : "Prikaži sve"}
        </button>
      )}

      <div className="mx-2 space-y-3 rounded-xl bg-neutral-900 p-4">
        <div className="grid grid-cols-4 gap-1">
          <PresetButton onClick={() => applyOverviewPreset("today")}>Danas</PresetButton>
          <PresetButton onClick={() => applyOverviewPreset("week")}>Ova nedelja</PresetButton>
          <PresetButton onClick={() => applyOverviewPreset("month")}>Ovaj mesec</PresetButton>
          <PresetButton onClick={() => applyOverviewPreset("lastMonth")}>Prošli mesec</PresetButton>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0 text-xs text-neutral-400">
            Od
            <input type="date" value={overviewStart} onChange={(event) => setOverviewStart(event.target.value)} className="mt-1 w-full min-w-0 rounded bg-neutral-800 px-2 py-1 text-sm text-white" />
          </label>
          <label className="min-w-0 text-xs text-neutral-400">
            Do
            <input type="date" value={overviewEnd} onChange={(event) => setOverviewEnd(event.target.value)} className="mt-1 w-full min-w-0 rounded bg-neutral-800 px-2 py-1 text-sm text-white" />
          </label>
        </div>
        <p className="text-sm text-neutral-300">
          Ukupno naplaćeno: <span className="font-medium text-green-400">{overviewTotal} RSD</span>
        </p>
      </div>
    </div>
  );
}

function InvoiceCard({ invoice, onPayment, onCancel }) {
  const meta = {
    pending: { label: "Na čekanju", color: "bg-red-900/30 text-red-300" },
    partially_paid: { label: "Delimično plaćeno", color: "bg-yellow-900/30 text-yellow-300" },
    paid: { label: "Plaćeno", color: "bg-green-900/30 text-green-300" },
    cancelled: { label: "Otkazano", color: "bg-neutral-800 text-neutral-400" },
  }[invoice.status] || { label: invoice.status, color: "bg-neutral-800 text-neutral-300" };

  const statusDate =
    invoice.paidAt &&
    (invoice.status === "paid" || invoice.status === "partially_paid")
      ? ` · ${formatDate(invoice.paidAt)}`
      : "";

  return (
    <div className="mx-2 space-y-2 rounded-xl bg-neutral-900 p-4">
      <Link to={`/profil/${invoice.clientId}`} className="font-medium text-blue-400">
        {invoice.clientName || "-"}
      </Link>

      <div>
        <p className="text-sm text-neutral-300">{invoice.subscriptionName || "-"}</p>
        {invoice.membership ? (
          <p className="text-xs text-neutral-400">
            {formatDate(invoice.membership.startDate)} - {formatDate(invoice.membership.endDate)}
          </p>
        ) : (
          <p className="text-xs text-amber-300">Period članarine nije povezan.</p>
        )}
      </div>

      <p className="text-sm">{invoice.paidAmount || 0} / {invoice.amount || 0} RSD</p>

      <span className={`inline-block rounded px-2 py-0.5 text-xs ${meta.color}`}>
        {meta.label}{statusDate}
      </span>

      {invoice.status !== "paid" && invoice.status !== "cancelled" && (
        <div className="flex gap-2 pt-2">
          <button onClick={onPayment} className="flex-1 rounded bg-blue-600 py-1.5 text-sm text-white">Uplata</button>
          <button onClick={onCancel} className="flex-1 rounded bg-red-600 py-1.5 text-sm text-white">Otkaži</button>
        </div>
      )}
    </div>
  );
}

function PresetButton({ children, onClick }) {
  return (
    <button onClick={onClick} className="min-w-0 rounded bg-neutral-800 px-1 py-1 text-[11px] text-white">
      {children}
    </button>
  );
}
