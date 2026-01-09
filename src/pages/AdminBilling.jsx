import { getAuth } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
  getDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";

export default function AdminBilling() {
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [users, setUsers] = useState([]);
  const [packages, setPackages] = useState([]);

  const [searchClient, setSearchClient] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");

  // Payments Overview
  const [overviewStart, setOverviewStart] = useState("");
  const [overviewEnd, setOverviewEnd] = useState("");
  const [overviewInvoices, setOverviewInvoices] = useState([]);

  useEffect(() => {
    loadClients();
    loadPackages();
  }, []);

  useEffect(() => {
    if (users.length > 0) loadInvoices();
  }, [users]);

  useEffect(() => {
    applyFilters();
  }, [invoices, searchClient, filterStatus, filterStart, filterEnd]);

  useEffect(() => {
    applyOverviewFilter();
  }, [invoices, overviewStart, overviewEnd]);

  // --- Load Clients ---
  async function loadClients() {
    const snap = await getDocs(
      query(collection(db, "users"), where("role", "==", "client"), where("active", "==", true))
    );
    setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  // --- Load Packages ---
  async function loadPackages() {
    const snap = await getDocs(collection(db, "subscriptions"));
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setPackages(data);
  }

  // --- Load Invoices ---
  async function loadInvoices() {
    const snap = await getDocs(collection(db, "payments"));
    const invoicesData = [];
    for (const d of snap.docs) {
      const pay = d.data();
      const user = users.find(u => u.id === pay.userId) || { name: "-", surname: "-", id: pay.userId };
      const subSnap = await getDoc(doc(db, "clientSubscriptions", pay.subscriptionId));
      const subData = subSnap.data();
      let pkgName = "-";
      let start = null;
      let end = null;
      if (subData) {
        const pkgSnap = await getDoc(doc(db, "subscriptions", subData.subscriptionId));
        const pkg = pkgSnap.data();
        pkgName = pkg?.name || "-";
        start = subData.startDate?.toDate ? subData.startDate.toDate() : new Date(subData.startDate);
        end = subData.endDate?.toDate ? subData.endDate.toDate() : new Date(subData.endDate);
      }
      invoicesData.push({
        id: d.id,
        clientName: `${user.name} ${user.surname}`,
        clientId: user.id,
        packageName: pkgName,
        startDate: start,
        endDate: end,
        amount: pay.amount,
        paidAmount: pay.paidAmount || 0,
        status: pay.status,
        note: pay.note || "",
        paidAt: pay.paidAt?.toDate ? pay.paidAt.toDate() : pay.paidAt
      });
    }
    invoicesData.sort((a, b) => (b.startDate || 0) - (a.startDate || 0));
    setInvoices(invoicesData);
  }

  const formatDate = (d) =>
    d instanceof Date
      ? d.toLocaleDateString("sr-Latn-RS", { day: "2-digit", month: "long", year: "numeric" })
      : "—";

  const statusLabel = (status) => {
    switch (status) {
      case "pending": return "Na čekanju";
      case "partially_paid": return "Delimično plaćeno";
      case "paid": return "Plaćeno";
      case "cancelled": return "Otkazano";
      default: return status;
    }
  };

  const statusColor = (status) => {
    switch (status) {
      case "pending": return "#f8d7da";
      case "partially_paid": return "#fff3cd";
      case "paid": return "#d4edda";
      case "cancelled": return "#e2e3e5";
      default: return "transparent";
    }
  };

  const handlePartialPayment = async (invoice) => {
    const input = prompt(`Unesite iznos koji je klijent platio (maks ${invoice.amount - invoice.paidAmount} RSD):`, "");
    if (!input) return;
    const paid = Number(input);
    if (isNaN(paid) || paid <= 0 || paid > invoice.amount - invoice.paidAmount) {
      alert("Nevalidan iznos!");
      return;
    }

    const newPaidAmount = invoice.paidAmount + paid;
    const newStatus = newPaidAmount === invoice.amount ? "paid" : "partially_paid";

    await updateDoc(doc(db, "payments", invoice.id), {
      paidAmount: newPaidAmount,
      status: newStatus,
      paidAt: new Date()
    });

    loadInvoices();
  };

  const handleCancelInvoice = async (invoice) => {
    const confirmCancel = window.confirm("Da li ste sigurni da želite da otkažete fakturu?");
    if (!confirmCancel) return;

    await updateDoc(doc(db, "payments", invoice.id), { status: "cancelled" });
    loadInvoices();
  };

  const applyFilters = () => {
    let filtered = [...invoices];

    if (searchClient) {
      const searchLower = searchClient.toLowerCase();
      filtered = filtered.filter(inv => inv.clientName.toLowerCase().includes(searchLower));
    }

    if (filterStatus !== "all") {
      filtered = filtered.filter(inv => inv.status === filterStatus);
    }

    if (filterStart) {
      const startDate = new Date(filterStart);
      filtered = filtered.filter(inv => inv.startDate && inv.startDate >= startDate);
    }

    if (filterEnd) {
      const endDate = new Date(filterEnd);
      filtered = filtered.filter(inv => inv.endDate && inv.endDate <= endDate);
    }

    setFilteredInvoices(filtered);
  };

  // --- Payments Overview ---
  const applyPresetFilter = (preset) => {
    const today = new Date();
    let start, end;

    switch(preset) {
      case "today":
        start = new Date(today.setHours(0,0,0,0));
        end = new Date(today.setHours(23,59,59,999));
        break;
      case "thisWeek":
        const dayOfWeek = today.getDay(); // 0 (Sun) - 6 (Sat)
        start = new Date(today);
        start.setDate(today.getDate() - dayOfWeek + 1); // Monday start
        start.setHours(0,0,0,0);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23,59,59,999);
        break;
      case "thisMonth":
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case "lastMonth":
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
        break;
      default:
        start = null;
        end = null;
    }

    setOverviewStart(start ? start.toISOString().split("T")[0] : "");
    setOverviewEnd(end ? end.toISOString().split("T")[0] : "");
  };

  const applyOverviewFilter = () => {
    let filtered = invoices.filter(inv => inv.status === "paid" || inv.status === "partially_paid");

    if (overviewStart) {
      const startDate = new Date(overviewStart);
      filtered = filtered.filter(inv => inv.paidAt && inv.paidAt >= startDate);
    }

    if (overviewEnd) {
      const endDate = new Date(overviewEnd);
      filtered = filtered.filter(inv => inv.paidAt && inv.paidAt <= endDate);
    }

    setOverviewInvoices(filtered);
  };

  const overviewTotal = overviewInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);

  return (
    <div>
      <h2>Fakturiranje</h2>

      {/* --- Filters / Search --- */}
      <div style={{ marginBottom: 10, display: "flex", gap: 10 }}>
        <input
          placeholder="Pretraga po imenu klijenta"
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
        <label>
          Od:
          <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} />
        </label>
        <label>
          Do:
          <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} />
        </label>
      </div>

      {/* --- Billing Table --- */}
      <table border="1" cellPadding="5" style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th>Klijent</th>
            <th>Paket / Period</th>
            <th>Iznos (RSD)</th>
            <th>Status</th>
            <th>Akcija</th>
          </tr>
        </thead>
        <tbody>
          {filteredInvoices.length === 0 ? (
            <tr>
              <td colSpan="5" style={{ textAlign: "center" }}>Nema faktura</td>
            </tr>
          ) : (
            filteredInvoices.map(inv => (
              <tr key={inv.id} style={{ backgroundColor: statusColor(inv.status) }}>
                <td>
                  <Link to={`/profil/${inv.clientId}`}>
                    {inv.clientName}
                  </Link>
                </td>
                <td>{inv.packageName} — {formatDate(inv.startDate)} – {formatDate(inv.endDate)}</td>
                <td>{inv.paidAmount} / {inv.amount}</td>
                <td>{statusLabel(inv.status)}</td>
                <td>
                  {inv.status !== "cancelled" && inv.status !== "paid" && (
                    <>
                      <button style={{ marginRight: 5 }} onClick={() => handlePartialPayment(inv)}>Delimično plaćeno</button>
                      <button onClick={() => handleCancelInvoice(inv)}>Otkazi</button>
                    </>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* --- Payments Overview --- */}
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

      <table border="1" cellPadding="5" style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th>Klijent</th>
            <th>Plaćeno (RSD)</th>
            <th>Datum uplate</th>
          </tr>
        </thead>
        <tbody>
          {overviewInvoices.length === 0 ? (
            <tr>
              <td colSpan="3" style={{ textAlign: "center" }}>Nema uplata</td>
            </tr>
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
              <td style={{ fontWeight: "bold" }}>Ukupno</td>
              <td style={{ fontWeight: "bold" }}>{overviewTotal}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
