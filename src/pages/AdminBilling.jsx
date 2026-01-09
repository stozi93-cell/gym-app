import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  updateDoc,
  doc
} from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";

export default function AdminBilling() {
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);

  const [searchClient, setSearchClient] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [showAll, setShowAll] = useState(false);

  // Payments overview
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

    const data = snap.docs.map(d => {
      const b = d.data();
      return {
        id: d.id,
        clientId: b.clientId,
        clientName: b.clientName || "-",
        subscriptionName: b.subscriptionName || "-",
        amount: b.amount || 0,
        paidAmount: b.paidAmount || 0,
        status: b.status,
        createdAt: b.createdAt?.toDate ? b.createdAt.toDate() : null,
        paidAt: b.paidAt?.toDate ? b.paidAt.toDate() : null
      };
    });

    data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    setInvoices(data);
  }

  const formatDate = d =>
    d instanceof Date
      ? d.toLocaleDateString("sr-Latn-RS", {
          day: "2-digit",
          month: "long",
          year: "numeric"
        })
      : "—";

  const statusLabel = status => {
    switch (status) {
      case "pending": return "Na čekanju";
      case "partially_paid": return "Delimično plaćeno";
      case "paid": return "Plaćeno";
      case "cancelled": return "Otkazano";
      default: return status;
    }
  };

  const statusColor = status => {
    switch (status) {
      case "pending": return "#f8d7da";
      case "partially_paid": return "#fff3cd";
      case "paid": return "#d4edda";
      case "cancelled": return "#e2e3e5";
      default: return "transparent";
    }
  };

  const handlePartialPayment = async inv => {
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
      paidAt: new Date()
    });

    loadInvoices();
  };

  const handleCancel = async inv => {
    if (!window.confirm("Otkaži fakturu?")) return;

    await updateDoc(doc(db, "billing", inv.id), {
      status: "cancelled"
    });

    loadInvoices();
  };

  const applyFilters = () => {
    let list = [...invoices];

    if (searchClient) {
      const s = searchClient.toLowerCase();
      list = list.filter(i => i.clientName.toLowerCase().includes(s));
    }

    if (filterStatus !== "all") {
      list = list.filter(i => i.status === filterStatus);
    }

    setFilteredInvoices(list);
  };

  // ---- Payments Overview ----

  const applyPresetFilter = preset => {
    const today = new Date();
    let start, end;

    switch (preset) {
      case "today":
        start = new Date(today.setHours(0, 0, 0, 0));
        end = new Date(today.setHours(23, 59, 59, 999));
        break;
      case "thisWeek": {
        const d = today.getDay() || 7;
        start = new Date(today);
        start.setDate(today.getDate() - d + 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case "thisMonth":
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
        break;
      case "lastMonth":
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
        break;
      default:
        start = null;
        end = null;
    }

    setOverviewStart(start ? start.toISOString().slice(0, 10) : "");
    setOverviewEnd(end ? end.toISOString().slice(0, 10) : "");
  };

  const applyOverviewFilter = () => {
    let list = invoices.filter(
      i => i.status === "paid" || i.status === "partially_paid"
    );

    if (overviewStart) {
      const s = new Date(overviewStart);
      list = list.filter(i => i.paidAt && i.paidAt >= s);
    }

    if (overviewEnd) {
      const e = new Date(overviewEnd);
      e.setHours(23, 59, 59, 999);
      list = list.filter(i => i.paidAt && i.paidAt <= e);
    }

    setOverviewInvoices(list);
  };

  const overviewTotal = overviewInvoices.reduce(
    (sum, i) => sum + i.paidAmount,
    0
  );

  const visibleInvoices = showAll
    ? filteredInvoices
    : filteredInvoices.slice(0, 10);

  return (
    <div>
      <h2>Fakturisanje</h2>

      {/* Filters */}
      <div style={{ marginBottom: 10, display: "flex", gap: 10 }}>
        <input
          placeholder="Pretraga klijenta"
          value={searchClient}
          onChange={e => setSearchClient(e.target.value)}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">Sve</option>
          <option value="pending">Na čekanju</option>
          <option value="partially_paid">Delimično plaćeno</option>
          <option value="paid">Plaćeno</option>
          <option value="cancelled">Otkazano</option>
        </select>
      </div>

      {/* Billing Table */}
      <table border="1" width="100%" cellPadding="5">
        <thead>
          <tr>
            <th>Klijent</th>
            <th>Pretplata</th>
            <th>Iznos</th>
            <th>Status</th>
            <th>Akcija</th>
          </tr>
        </thead>
        <tbody>
          {visibleInvoices.length === 0 ? (
            <tr><td colSpan="5" align="center">Nema faktura</td></tr>
          ) : (
            visibleInvoices.map(inv => (
              <tr key={inv.id} style={{ background: statusColor(inv.status) }}>
                <td>
                  <Link to={`/profil/${inv.clientId}`}>
                    {inv.clientName}
                  </Link>
                </td>
                <td>{inv.subscriptionName}</td>
                <td>{inv.paidAmount} / {inv.amount}</td>
                <td>{statusLabel(inv.status)}</td>
                <td>
                  {inv.status !== "paid" && inv.status !== "cancelled" && (
                    <>
                      <button onClick={() => handlePartialPayment(inv)}>Uplata</button>
                      <button onClick={() => handleCancel(inv)}>Otkaži</button>
                    </>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {filteredInvoices.length > 10 && (
        <button style={{ marginTop: 10 }} onClick={() => setShowAll(!showAll)}>
          {showAll ? "Prikaži manje" : "Prikaži sve"}
        </button>
      )}

      {/* Payments Overview */}
      <h3 style={{ marginTop: 30 }}>Pregled uplata</h3>

      <div style={{ marginBottom: 10, display: "flex", gap: 10 }}>
        <button onClick={() => applyPresetFilter("today")}>Danas</button>
        <button onClick={() => applyPresetFilter("thisWeek")}>Ove nedelje</button>
        <button onClick={() => applyPresetFilter("thisMonth")}>Ovaj mesec</button>
        <button onClick={() => applyPresetFilter("lastMonth")}>Prošli mesec</button>
        <label>
          Od:
          <input type="date" value={overviewStart} onChange={e => setOverviewStart(e.target.value)} />
        </label>
        <label>
          Do:
          <input type="date" value={overviewEnd} onChange={e => setOverviewEnd(e.target.value)} />
        </label>
      </div>

      <table border="1" width="100%" cellPadding="5">
        <thead>
          <tr>
            <th>Klijent</th>
            <th>Plaćeno (RSD)</th>
            <th>Datum uplate</th>
          </tr>
        </thead>
        <tbody>
          {overviewInvoices.length === 0 ? (
            <tr><td colSpan="3" align="center">Nema uplata</td></tr>
          ) : (
            overviewInvoices.map(inv => (
              <tr key={inv.id}>
                <td>
                  <Link to={`/profil/${inv.clientId}`}>
                    {inv.clientName}
                  </Link>
                </td>
                <td>{inv.paidAmount}</td>
                <td>{formatDate(inv.paidAt)}</td>
              </tr>
            ))
          )}
        </tbody>
        {overviewInvoices.length > 0 && (
          <tfoot>
            <tr>
              <td><b>Ukupno</b></td>
              <td><b>{overviewTotal}</b></td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
