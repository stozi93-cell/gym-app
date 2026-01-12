import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

export default function ClientProfile() {
  const { uid: routeUid } = useParams();
  const { user: authUser, profile, loading: authLoading } = useAuth();

  const uid = routeUid === "me" ? authUser?.uid : routeUid;
  const role = profile?.role;

  const [user, setUser] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [lastVisit, setLastVisit] = useState(null);
  const [showAllSubs, setShowAllSubs] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [editingSubId, setEditingSubId] = useState(null);

  useEffect(() => {
    if (authLoading || !uid) return;

    let alive = true;

    async function load() {
      // USER
      const userSnap = await getDoc(doc(db, "users", uid));
      if (!alive || !userSnap.exists()) return;

      const userData = userSnap.data();
      const rawDob = userData.dob ?? userData.datumRodjenja ?? null;
      const dob = rawDob
        ? rawDob.toDate
          ? rawDob.toDate().toISOString().slice(0, 10)
          : new Date(rawDob).toISOString().slice(0, 10)
        : "";

      const normalized = { ...userData, dob };
      setUser(normalized);
      setFormData(normalized);

      // LAST VISIT
      const bookingSnap = await getDocs(
        query(collection(db, "bookings"), where("userId", "==", uid))
      );

      if (!bookingSnap.empty) {
        const visits = bookingSnap.docs
          .map((d) => d.data())
          .filter((b) => b.checkedInAt)
          .sort((a, b) => b.checkedInAt.toDate() - a.checkedInAt.toDate());

        setLastVisit(visits[0]?.checkedInAt.toDate() ?? null);
      } else {
        setLastVisit(null);
      }

      // SUBSCRIPTIONS
      const csSnap = await getDocs(
        query(collection(db, "clientSubscriptions"), where("userId", "==", uid))
      );

      const subs = [];
      for (const d of csSnap.docs) {
        const cs = d.data();
        const subSnap = await getDoc(doc(db, "subscriptions", cs.subscriptionId));
        const pkg = subSnap.data();
        if (!pkg) continue;

        const checkInsArray = Array.isArray(cs.checkInsArray)
          ? cs.checkInsArray
          : [];

        let weeklyCheckIns = cs.weeklyCheckIns;
        if (!weeklyCheckIns || weeklyCheckIns === "default") {
          weeklyCheckIns = pkg.defaultCheckIns || "unlimited";
        }

        let startDate = cs.startDate?.toDate
          ? cs.startDate.toDate()
          : new Date(cs.startDate);

        let endDate = cs.endDate?.toDate
          ? cs.endDate.toDate()
          : new Date(cs.endDate);

        const billingSnap = await getDocs(
          query(
            collection(db, "billing"),
            where("clientId", "==", uid),
            where("subscriptionId", "==", cs.subscriptionId)
          )
        );

        const invoices = billingSnap.docs.map((inv) => ({
          id: inv.id,
          ...inv.data(),
        }));

        subs.push({
          id: d.id,
          ...pkg,
          startDate,
          endDate,
          active: cs.active,
          checkInsArray,
          weeklyCheckIns,
          payments: invoices,
        });
      }

      subs.sort((a, b) => b.startDate - a.startDate);
      setSubscriptions(subs);
    }

    load();
    return () => (alive = false);
  }, [uid, authLoading]);

  if (authLoading || !user) {
    return <div className="text-center text-neutral-400">Učitavanje…</div>;
  }

  const formatDate = (d) => {
    if (!d) return "—";
    const dateObj = d?.toDate ? d.toDate() : new Date(d);
    return dateObj.toLocaleDateString("sr-Latn-RS");
  };

  const renderText = (v) =>
    v instanceof Timestamp ? formatDate(v) : v || "—";

  const saveProfile = async () => {
    await updateDoc(doc(db, "users", uid), {
      ...formData,
      dob: formData.dob ? new Date(formData.dob) : null,
    });
    setUser(formData);
    setEditMode(false);
  };

  const visibleSubs = showAllSubs ? subscriptions : subscriptions.slice(0, 1);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="rounded-2xl bg-neutral-900/80 p-5 shadow">
        <h1 className="text-xl font-semibold text-white">
          {user.name} {user.surname}
        </h1>
        <p className="text-sm text-neutral-400">
          {role === "admin" ? "Administrator" : "Klijent"}
        </p>
      </div>

      {/* BASIC INFO */}
      <Card title="Lični podaci">
        <Info label="Email" value={renderText(user.email)} />
        <Info label="Telefon" value={renderText(user.phone)} />
        <Info label="Datum rođenja" value={formatDate(user.dob)} />
        <Info label="Poslednja poseta" value={formatDate(lastVisit)} />
      </Card>

      {/* SUBSCRIPTIONS */}
      <Card title="Pretplate">
        {visibleSubs.length === 0 && (
          <p className="text-sm text-neutral-400">Nema pretplata.</p>
        )}

        {visibleSubs.map((s, idx) => {
          const active = s.active && s.endDate >= new Date();
          const editing = editingSubId === s.id;
          const isLatest = idx === 0;

          return (
            <div
              key={s.id}
              className={`rounded-xl border p-4 ${
                active
                  ? "border-brand-green-700 bg-brand-green-900/10"
                  : "border-red-700 bg-red-900/10"
              }`}
            >
              <p className="font-medium text-white">{s.name}</p>
              <p className="text-sm text-neutral-400">
                {formatDate(s.startDate)} – {formatDate(s.endDate)}
              </p>

              <p className="text-sm">
                Status:{" "}
                <span
                  className={active ? "text-green-400" : "text-red-400"}
                >
                  {active ? "Aktivna" : "Neaktivna"}
                </span>
              </p>

              <p className="text-sm">
                Dolasci nedeljno:{" "}
                {s.weeklyCheckIns === "unlimited"
                  ? "Neograničeno"
                  : s.weeklyCheckIns}
              </p>

              {/* PAYMENTS */}
              <div className="mt-3">
                <p className="text-sm font-medium text-neutral-300">
                  Fakture
                </p>
                {s.payments.length === 0 ? (
                  <p className="text-sm text-neutral-400">—</p>
                ) : (
                  <ul className="ml-4 list-disc text-sm">
                    {s.payments.map((p) => (
                      <li
                        key={p.id}
                        className={
                          p.status === "paid"
                            ? "text-green-400"
                            : p.status === "partially_paid"
                            ? "text-orange-400"
                            : "text-red-400"
                        }
                      >
                        {p.paidAmount || 0} / {p.amount} RSD —{" "}
                        {p.status}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {role === "admin" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {active && (
                    <button
                      onClick={() => setEditingSubId(s.id)}
                      className="rounded-lg bg-neutral-700 px-3 py-1 text-sm"
                    >
                      Uredi
                    </button>
                  )}
                  {active && (
                    <button
                      onClick={() =>
                        updateDoc(
                          doc(db, "clientSubscriptions", s.id),
                          { active: false }
                        )
                      }
                      className="rounded-lg bg-red-700 px-3 py-1 text-sm"
                    >
                      Deaktiviraj
                    </button>
                  )}
                  {!active && isLatest && (
                    <button
                      onClick={() =>
                        updateDoc(
                          doc(db, "clientSubscriptions", s.id),
                          { active: true }
                        )
                      }
                      className="rounded-lg bg-green-700 px-3 py-1 text-sm"
                    >
                      Reaktiviraj
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {subscriptions.length > 1 && (
          <button
            onClick={() => setShowAllSubs(!showAllSubs)}
            className="mt-4 text-sm text-brand-blue-400"
          >
            {showAllSubs
              ? "Sakrij starije pretplate"
              : "Prikaži starije pretplate"}
          </button>
        )}
      </Card>

      {/* NOTES */}
      <Card title="Napomene">
        <Info label="Ciljevi" value={renderText(user.goals)} />
        <Info
          label="Zdravstvene napomene"
          value={renderText(user.healthNotes)}
        />
      </Card>
    </div>
  );
}

/* UI helpers */
function Card({ title, children }) {
  return (
    <div className="rounded-2xl bg-neutral-900/80 p-5 shadow space-y-4">
      <h2 className="text-sm font-medium text-neutral-300">{title}</h2>
      {children}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}
