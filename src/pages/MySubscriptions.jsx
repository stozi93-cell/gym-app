import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

export default function MySubscriptions() {
  const { user } = useAuth();
  const [subs, setSubs] = useState([]);

  useEffect(() => {
    if (user) load();
  }, [user]);

  async function load() {
    const snap = await getDocs(
      query(
        collection(db, "clientSubscriptions"),
        where("userId", "==", user.uid)
      )
    );

    const data = [];

    for (const d of snap.docs) {
      const cs = d.data();

      const pkgSnap = await getDoc(
        doc(db, "subscriptions", cs.subscriptionId)
      );

      // Normalize dates safely
      const startDate = cs.startDate?.toDate ? cs.startDate.toDate() : new Date(cs.startDate);
      const endDate = cs.endDate?.toDate ? cs.endDate.toDate() : new Date(cs.endDate);

      data.push({
        id: d.id,
        ...pkgSnap.data(),
        startDate,
        endDate,
      });
    }

    setSubs(data);
  }

  const today = new Date();

  // Helper to format dates in Latin months
  const formatDate = (d) =>
    d instanceof Date
      ? d.toLocaleDateString("sr-Latn-RS", { day: "2-digit", month: "long", year: "numeric" })
      : d?.toDate
      ? d.toDate().toLocaleDateString("sr-Latn-RS", { day: "2-digit", month: "long", year: "numeric" })
      : "—";

  if (!subs.length) {
    return <p>Nemaš nijednu pretplatu.</p>;
  }

  return (
    <div>
      <h2>Moje pretplate</h2>

      {subs.map((s) => {
        const active = s.endDate >= today;

        return (
          <div
            key={s.id}
            style={{
              border: "1px solid #ccc",
              padding: 12,
              marginBottom: 10,
              borderRadius: 6,
              backgroundColor: active ? "#eaffea" : "#ffeaea",
            }}
          >
            <h3>{s.name}</h3>

            <p>
              <b>Period:</b> {formatDate(s.startDate)} – {formatDate(s.endDate)}
            </p>

            <p>
              <b>Cena:</b> {s.price ?? "—"} RSD
            </p>

            <p>
              <b>Status:</b>{" "}
              <span style={{ color: active ? "green" : "red" }}>
                {active ? "Aktivna" : "Istekla"}
              </span>
            </p>
          </div>
        );
      })}
    </div>
  );
}
