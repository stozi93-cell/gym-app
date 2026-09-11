import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import InvoiceEditor from "../src/components/InvoiceEditor";
import "../src/index.css";

function Preview() {
  const [open, setOpen] = useState(true);
  const [result, setResult] = useState(null);
  const invoice = {
    id: "demo-invoice", clientName: "Test Klijent", subscriptionName: "Mesečna članarina",
    amount: 5000, paidAmount: 5000, status: "paid",
    membership: { startDate: { toDate: () => new Date(2026, 8, 1) }, endDate: { toDate: () => new Date(2026, 8, 30) } },
  };
  return <main style={{ padding: 20 }}>
    <button onClick={() => setOpen(true)}>Izmeni fakturu</button>
    {result && <p role="status">Sačuvano: {result.amount} RSD / uplata {result.paidAmount} RSD</p>}
    {open && <InvoiceEditor invoice={invoice} onClose={() => setOpen(false)} onSave={async (values) => { setResult(values); setOpen(false); }} />}
  </main>;
}
createRoot(document.getElementById("root")).render(<Preview />);
