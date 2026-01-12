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

  useEffect(() => {
    if (authLoading || !uid) return;
    load();
  }, [uid, authLoading]);

  async function load() {
    // ─── USER ─────────────────────────
    const userSnap = await getDoc(doc(db, "users", uid));
    if (!userSnap.exists()) return;

    const u = userSnap.data();
    const rawDob = u.dob ?? null;

    const dob = rawDob
      ? rawDob.toDate
        ? rawDob.toDate().toISOString().slice(0, 10)
        : new Date(rawDob).toISOString().slice(0, 10)
      : "";

    const normalized = {
      ...u,
      name: u.name || "",
      surname: u.surname || "",
      dob,
    };

    setUser(normalized);
    setFormData(normalized);

    // ─── LAST VISIT ───────────────────
    const bookingSnap = await getDocs(
      query(collection(db, "bookings"), where("userId", "==", uid))
    );

    if (!bookingSnap.empty) {
      const visits = bookingSnap.docs
        .map((d) => d.data())
        .filter((b) => b.checkedInAt)
        .sort(
          (a, b) => b.checkedInAt.toDate() - a.checkedInAt.toDate()
        );

      setLastVisit(visits[0]?.checkedInAt.toDate() ?? null);
    } else {
      setLastVisit(null);
    }

    // ─── SUBSCRIPTIONS + BILLING ───────
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

      const startDate = cs.startDate.toDate();
      const endDate = cs.endDate.toDate();

      // 🔹 BILLING (RESTORED)
      const billingSnap = await getDocs(
        query(
          collection(db, "billing"),
          where("clientId", "==", uid),
          where("subscriptionId", "==", cs.subscriptionId)
        )
      );

      const payments = billingSnap.docs.map((b) => ({
        id: b.id,
        ...b.data(),
      }));

      subs.push({
        id: d.id,
        ...pkg,
        startDate,
        endDate,
        active: cs.active,
        checkInsArray,
        weeklyCheckIns,
        payments, // 👈 restored
      });
    }

    subs.sort((a, b) => b.startDate - a.startDate);
    setSubscriptions(subs);
  }

  if (authLoading || !user) return <div>Učitavanje...</div>;

  // ─── HELPERS ───────────────────────
  const formatDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("sr-Latn-RS", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const renderText = (v) =>
    v instanceof Timestamp ? formatDate(v) : v || "—";

  const saveProfile = async () => {
    await updateDoc(doc(db, "users", uid), {
      name: formData.name,
      surname: formData.surname,
      email: formData.email,
      phone: formData.phone,
      dob: formData.dob ? new Date(formData.dob) : null,
      goals: formData.goals,
      healthNotes: formData.healthNotes,
      ...(role === "admin" && { trainingNotes: formData.trainingNotes }),
    });

    setUser(formData);
    setEditMode(false);
  };

  const today = new Date();

  const activeSubs = subscriptions.filter(
    (s) => s.active && s.endDate >= today
  );

  const visibleSubs = showAllSubs
    ? subscriptions
    : activeSubs.length
    ? activeSubs
    : subscriptions.slice(0, 1);

  const changeCheckIn = async (subId, weekIndex, delta) => {
    const sub = subscriptions.find((s) => s.id === subId);
    if (!sub) return;

    const arr = [...sub.checkInsArray];
    arr[weekIndex] = (arr[weekIndex] || 0) + delta;
    if (arr[weekIndex] < 0) arr[weekIndex] = 0;

    await updateDoc(doc(db, "clientSubscriptions", subId), {
      checkInsArray: arr,
    });

    load();
  };

  const paymentColor = (status) => {
    switch (status) {
      case "paid":
        return "green";
      case "partially_paid":
        return "orange";
      default:
        return "red";
    }
  };

  return (
    <div>
      <h2>Profil klijenta</h2>

      {!editMode && <button onClick={() => setEditMode(true)}>Uredi profil</button>}
      {editMode && (
        <>
          <button onClick={saveProfile}>Sačuvaj</button>
          <button onClick={() => { setEditMode(false); setFormData(user); }}>
            Otkaži
          </button>
        </>
      )}

      {/* LIČNI PODACI */}
      <p><b>Ime:</b> {editMode ? <input value={formData.name || ""} onChange={(e)=>setFormData({...formData,name:e.target.value})}/> : renderText(user.name)}</p>
      <p><b>Prezime:</b> {editMode ? <input value={formData.surname || ""} onChange={(e)=>setFormData({...formData,surname:e.target.value})}/> : renderText(user.surname)}</p>
      <p><b>Email:</b> {editMode ? <input value={formData.email || ""} onChange={(e)=>setFormData({...formData,email:e.target.value})}/> : renderText(user.email)}</p>
      <p><b>Telefon:</b> {editMode ? <input value={formData.phone || ""} onChange={(e)=>setFormData({...formData,phone:e.target.value})}/> : renderText(user.phone)}</p>
      <p><b>Datum rođenja:</b> {editMode ? <input type="date" value={formData.dob || ""} onChange={(e)=>setFormData({...formData,dob:e.target.value})}/> : formatDate(user.dob)}</p>
      <p><b>Poslednja poseta:</b> {formatDate(lastVisit)}</p>

      <hr />

      <h3>Pretplate</h3>

      {visibleSubs.map((s) => {
        const active = s.active && s.endDate >= today;

        return (
          <div key={s.id}>
            <p><b>{s.name}</b></p>
            <p>Period: {formatDate(s.startDate)} – {formatDate(s.endDate)}</p>
            <p>Status: {active ? "Aktivna" : "Neaktivna"}</p>

            <ul>
              {s.checkInsArray.map((c, i) => {
                const ws = new Date(s.startDate);
                ws.setDate(ws.getDate() + i * 7);
                const we = new Date(ws);
                we.setDate(ws.getDate() + 6);

                const allowed =
                  s.weeklyCheckIns === "unlimited"
                    ? "∞"
                    : s.weeklyCheckIns;

                return (
                  <li key={i}>
                    Nedelja {i + 1} ({formatDate(ws)} – {formatDate(we)}): {c || 0} / {allowed}
                    {role === "admin" && (
                      <>
                        <button onClick={() => changeCheckIn(s.id, i, 1)}>+</button>
                        <button onClick={() => changeCheckIn(s.id, i, -1)}>-</button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* 🔹 BILLING INFO */}
            <div>
              <b>Fakture:</b>
              {s.payments?.length ? (
                <ul>
                  {s.payments.map((p) => (
                    <li key={p.id} style={{ color: paymentColor(p.status) }}>
                      {p.paidAmount || 0} / {p.amount} RSD — {p.status}
                    </li>
                  ))}
                </ul>
              ) : (
                " —"
              )}
            </div>

            {role === "admin" && (
              <>
                {active ? (
                  <button onClick={async () => {
                    await updateDoc(doc(db, "clientSubscriptions", s.id), { active: false });
                    load();
                  }}>Deaktiviraj</button>
                ) : (
                  <button onClick={async () => {
                    await updateDoc(doc(db, "clientSubscriptions", s.id), { active: true });
                    load();
                  }}>Reaktiviraj</button>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* 🔹 TOGGLE BUTTON (FIXED) */}
      {subscriptions.length > 1 && (
        <button onClick={() => setShowAllSubs(!showAllSubs)}>
          {showAllSubs ? "Sakrij prethodne pretplate" : "Prikaži prethodne pretplate"}
        </button>
      )}

      <hr />

      <h3>Napomene</h3>

      <p>
        <b>Ciljevi:</b><br />
        {editMode ? (
          <textarea value={formData.goals || ""} onChange={(e)=>setFormData({...formData,goals:e.target.value})}/>
        ) : (
          renderText(user.goals)
        )}
      </p>

      <p>
        <b>Zdravstvene napomene:</b><br />
        {editMode ? (
          <textarea value={formData.healthNotes || ""} onChange={(e)=>setFormData({...formData,healthNotes:e.target.value})}/>
        ) : (
          renderText(user.healthNotes)
        )}
      </p>

      <p>
        <b>Trenažne napomene:</b><br />
        {editMode && role === "admin" ? (
          <textarea value={formData.trainingNotes || ""} onChange={(e)=>setFormData({...formData,trainingNotes:e.target.value})}/>
        ) : (
          renderText(user.trainingNotes)
        )}
      </p>
    </div>
  );
}
