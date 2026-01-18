import { useEffect, useState } from "react";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";

const INITIAL_LIMIT = 1;

export default function AdminBilling() {
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);

  const [searchClient, setSearchClient] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showAll, setShowAll] = useState(false);

  // overview
  const [overviewInvoices, setOverviewInvoices] = useState([]);
  const [overviewStart, setOverviewStart] = useState("");
  const [overviewEnd, setOverviewEnd] = useState("");

  useEffect(() => {
    loadInvoices();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [invoices, searchClient, filterStatus]);

  useEffect(() => {
    applyOverviewFilter();
  }, [invoices, overviewStart, overviewEnd]);

  async function loadInvoices() {
    const snap = await getDocs(collection(db, "billing"));
    const data = snap.docs
      .map((d) => {
        const b = d.data();
        return {
          id: d.id,
          clientId: b.clientId,
          clientName: b.clientName || "—",
          subscriptionName: b.subscriptionName || "—",
          amount: b.amount || 0,
          paidAmount: b.paidAmount || 0,
          status: b.status,
          createdAt: b.createdAt?.toDate?.() || null,
          paidAt: b.paidAt?.toDate?.() || null,
        };
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    setInvoices(data);
  }

  const statusMeta = {
    pending: { label: "Na čekanju", color: "bg-red-900/30 text-red-300" },
    partially_paid: {
      label: "Delimično plaćeno",
      color: "bg-yellow-900/30 text-yellow-300",
    },
    paid: { label: "Plaćeno", color: "bg-green-900/30 text-green-300" },
    cancelled: {
      label: "Otkazano",
      color: "bg-neutral-800 text-neutral-400",
    },
  };

  const formatDate = (d) =>
    d
      ? d.toLocaleDateString("sr-Latn-RS", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";

  async function handlePartialPayment(inv) {
    const max = inv.amount - inv.paidAmount;
    const input = prompt(`Unesite iznos (maks ${max} RSD):`);
    if (!input) return;

    const paid = Number(input);
    if (isNaN(paid) || paid <= 0 || paid > max) {
      alert("Nevalidan iznos");
      return;
    }

    const newPaid = inv.paidAmount + paid;

    await updateDoc(doc(db, "billing", inv.id), {
      paidAmount: newPaid,
      status: newPaid === inv.amount ? "paid" : "partially_paid",
      paidAt: new Date(),
    });

    loadInvoices();
  }

  async function handleCancel(inv) {
    if (!window.confirm("Otkaži fakturu?")) return;

    await updateDoc(doc(db, "billing", inv.id), {
      status: "cancelled",
    });

    loadInvoices();
  }

  function applyFilters() {
    let list = [...invoices];

    if (searchClient) {
      list = list.filter((i) =>
        i.clientName.toLowerCase().includes(searchClient.toLowerCase())
      );
    }

    if (filterStatus !== "all") {
      list = list.filter((i) => i.status === filterStatus);
    }

    setFilteredInvoices(list);
  }

  // ─────────────────────────────
  // Overview helpers
  // ─────────────────────────────
  function applyOverviewPreset(preset) {
    const now = new Date();
    let start, end;

    switch (preset) {
      case "today":
        start = new Date(now.setHours(0, 0, 0, 0));
        end = new Date(now.setHours(23, 59, 59, 999));
        break;

      case "week": {
        const day = now.getDay() || 7;
        start = new Date(now);
        start.setDate(now.getDate() - day + 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      }

      case "month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59
        );
        break;

      case "lastMonth":
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(
          now.getFullYear(),
          now.getMonth(),
          0,
          23,
          59,
          59
        );
        break;

      default:
        return;
    }

    setOverviewStart(start.toISOString().slice(0, 10));
    setOverviewEnd(end.toISOString().slice(0, 10));
  }

  function applyOverviewFilter() {
    let list = invoices.filter(
      (i) => i.status === "paid" || i.status === "partially_paid"
    );

    if (overviewStart) {
      const s = new Date(overviewStart);
      list = list.filter((i) => i.paidAt && i.paidAt >= s);
    }

    if (overviewEnd) {
      const e = new Date(overviewEnd);
      e.setHours(23, 59, 59, 999);
      list = list.filter((i) => i.paidAt && i.paidAt <= e);
    }

    setOverviewInvoices(list);
  }

  const overviewTotal = overviewInvoices.reduce(
    (sum, i) => sum + i.paidAmount,
    0
  );

  const visibleInvoices = showAll
    ? filteredInvoices
    : filteredInvoices.slice(0, INITIAL_LIMIT);

  return (
    <div className="px-2 py-1 space-y-6">
      <h1 className="px-2 text-xl font-semibold text-white">Fakture</h1>

      {/* Filters */}
      <div className="mx-2 rounded-xl bg-neutral-900 p-4 space-y-3">
        <input
          placeholder="Pretraga klijenta"
          value={searchClient}
          onChange={(e) => setSearchClient(e.target.value)}
          className="w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        />

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        >
          <option value="all">Sve</option>
          <option value="pending">Na čekanju</option>
          <option value="partially_paid">Delimično plaćeno</option>
          <option value="paid">Plaćeno</option>
          <option value="cancelled">Otkazano</option>
        </select>
      </div>

      {/* Invoice list */}
      <div className="space-y-3">
        {visibleInvoices.map((inv) => {
          const meta = statusMeta[inv.status];
          return (
            <div
              key={inv.id}
              className="mx-2 rounded-xl bg-neutral-900 p-4 space-y-2"
            >
              <Link
                to={`/profil/${inv.clientId}`}
                className="font-medium text-blue-400"
              >
                {inv.clientName}
              </Link>

              <p className="text-sm text-neutral-300">
                {inv.subscriptionName}
              </p>

              <p className="text-sm">
                {inv.paidAmount} / {inv.amount} RSD
              </p>

              <span
                className={`inline-block rounded px-2 py-0.5 text-xs ${meta.color}`}
              >
                {meta.label}
              </span>

              {inv.status !== "paid" && inv.status !== "cancelled" && (
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handlePartialPayment(inv)}
                    className="flex-1 rounded bg-blue-600 py-1.5 text-sm text-white"
                  >
                    Uplata
                  </button>
                  <button
                    onClick={() => handleCancel(inv)}
                    className="flex-1 rounded bg-red-600 py-1.5 text-sm text-white"
                  >
                    Otkaži
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredInvoices.length > INITIAL_LIMIT && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mx-2 text-sm text-blue-400"
        >
          {showAll ? "Prikaži manje" : "Prikaži sve"}
        </button>
      )}

      {/* Payments overview */}
      <div className="mx-2 rounded-xl bg-neutral-900 p-4 space-y-3">
        <h2 className="text-lg font-medium text-white">
          Pregled uplata
        </h2>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => applyOverviewPreset("today")}
            className="rounded bg-neutral-800 px-3 py-1 text-xs text-white"
          >
            Danas
          </button>
          <button
            onClick={() => applyOverviewPreset("week")}
            className="rounded bg-neutral-800 px-3 py-1 text-xs text-white"
          >
            Ova nedelja
          </button>
          <button
            onClick={() => applyOverviewPreset("month")}
            className="rounded bg-neutral-800 px-3 py-1 text-xs text-white"
          >
            Ovaj mesec
          </button>
          <button
            onClick={() => applyOverviewPreset("lastMonth")}
            className="rounded bg-neutral-800 px-3 py-1 text-xs text-white"
          >
            Prošli mesec
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={overviewStart}
            onChange={(e) => setOverviewStart(e.target.value)}
            className="rounded bg-neutral-800 px-2 py-1 text-sm"
          />
          <input
            type="date"
            value={overviewEnd}
            onChange={(e) => setOverviewEnd(e.target.value)}
            className="rounded bg-neutral-800 px-2 py-1 text-sm"
          />
        </div>

        <p className="text-sm text-neutral-300">
          Ukupno naplaćeno:{" "}
          <span className="font-medium text-green-400">
            {overviewTotal} RSD
          </span>
        </p>
      </div>
    </div>
  );
}
