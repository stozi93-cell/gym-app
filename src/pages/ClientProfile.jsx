// ClientProfile.jsx
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
        payments,
      });
    }

    subs.sort((a, b) => b.startDate - a.startDate);
    setSubscriptions(subs);
  }

  if (authLoading || !user) {
    return <div className="p-6 text-neutral-400">Učitavanje…</div>;
  }

  /* helpers */

  const formatDate = (d) =>
    d
      ? new Date(d).toLocaleDateString("sr-Latn-RS", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";

  const renderText = (v) =>
    v instanceof Timestamp ? formatDate(v) : v || "—";

  const lastVisitColor = () => {
    if (!lastVisit) return "text-neutral-400";
    const days =
      (new Date() - new Date(lastVisit)) / (1000 * 60 * 60 * 24);
    if (days < 7) return "text-green-400";
    if (days <= 30) return "text-orange-400";
    return "text-red-400";
  };

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
        return "text-green-400";
      case "partially_paid":
        return "text-orange-400";
      default:
        return "text-red-400";
    }
  };

  return (
    <div className="mx-auto max-w-[420px] space-y-5 px-1">
      {/* HEADER */}
      <div className="rounded-2xl bg-neutral-900/90 p-5 shadow">
        <h2 className="text-xl font-semibold text-white">
          {user.name} {user.surname}
        </h2>
        <p className={`mt-1 text-sm ${lastVisitColor()}`}>
          Poslednja poseta: {formatDate(lastVisit)}
        </p>
      </div>

      {/* ACTIONS */}
      {!editMode ? (
        <button
          onClick={() => setEditMode(true)}
          className="w-full rounded-xl bg-blue-600 py-2.5 text-white font-medium"
        >
          Uredi profil
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={saveProfile}
            className="flex-1 rounded-xl bg-green-600 py-2.5 text-white font-medium"
          >
            Sačuvaj
          </button>
          <button
            onClick={() => {
              setEditMode(false);
              setFormData(user);
            }}
            className="flex-1 rounded-xl bg-neutral-700 py-2.5 text-white"
          >
            Otkaži
          </button>
        </div>
      )}

      {/* SECTIONS */}
      <CollapsibleSection title="Lični podaci">
        <ProfileField label="Ime">
          {editMode ? (
            <Input value={formData.name} onChange={(v)=>setFormData({...formData,name:v})}/>
          ) : renderText(user.name)}
        </ProfileField>

        <ProfileField label="Prezime">
          {editMode ? (
            <Input value={formData.surname} onChange={(v)=>setFormData({...formData,surname:v})}/>
          ) : renderText(user.surname)}
        </ProfileField>

        <ProfileField label="Email">
          {editMode ? (
            <Input value={formData.email} onChange={(v)=>setFormData({...formData,email:v})}/>
          ) : renderText(user.email)}
        </ProfileField>

        <ProfileField label="Telefon">
          {editMode ? (
            <Input value={formData.phone} onChange={(v)=>setFormData({...formData,phone:v})}/>
          ) : renderText(user.phone)}
        </ProfileField>

        <ProfileField label="Datum rođenja">
          {editMode ? (
            <input
              type="date"
              value={formData.dob || ""}
              onChange={(e)=>setFormData({...formData,dob:e.target.value})}
              className="w-full rounded-lg bg-neutral-800 p-2 text-white"
            />
          ) : formatDate(user.dob)}
        </ProfileField>
      </CollapsibleSection>

      <CollapsibleSection title="Pretplate" defaultOpen>
        {visibleSubs.map((s) => {
          const active = s.active && s.endDate >= today;
          const allowed =
            s.weeklyCheckIns === "unlimited" ? "∞" : s.weeklyCheckIns;

          return (
            <div
              key={s.id}
              className={`rounded-xl border-l-4 p-4 mb-3 ${
                active ? "border-green-500" : "border-red-500"
              } bg-neutral-900/80`}
            >
              <p className="font-medium text-white">{s.name}</p>
              <p className="text-sm text-neutral-400">
                {formatDate(s.startDate)} – {formatDate(s.endDate)}
              </p>

              <ul className="mt-3 space-y-1 text-sm">
                {s.checkInsArray.map((c, i) => (
                  <li key={i} className="flex justify-between">
                    <span>
                      Nedelja {i + 1}: {c || 0} / {allowed}
                    </span>
                    {role === "admin" && (
                      <span className="flex gap-2">
                        <button className="px-2" onClick={()=>changeCheckIn(s.id,i,1)}>+</button>
                        <button className="px-2" onClick={()=>changeCheckIn(s.id,i,-1)}>-</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-3 text-sm">
                <p className="text-neutral-400">Fakture:</p>
                {s.payments?.length ? (
                  <ul className="ml-4 list-disc">
                    {s.payments.map((p) => (
                      <li key={p.id} className={paymentColor(p.status)}>
                        {p.paidAmount || 0} / {p.amount} RSD — {p.status}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-neutral-500">—</p>
                )}
              </div>
            </div>
          );
        })}

        {subscriptions.length > 1 && (
          <button
            onClick={() => setShowAllSubs(!showAllSubs)}
            className="w-full text-sm text-blue-400"
          >
            {showAllSubs
              ? "Sakrij prethodne pretplate"
              : "Prikaži prethodne pretplate"}
          </button>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Napomene">
        <ProfileField label="Ciljevi">
          {editMode ? (
            <Textarea value={formData.goals} onChange={(v)=>setFormData({...formData,goals:v})}/>
          ) : renderText(user.goals)}
        </ProfileField>

        <ProfileField label="Zdravstvene napomene">
          {editMode ? (
            <Textarea value={formData.healthNotes} onChange={(v)=>setFormData({...formData,healthNotes:v})}/>
          ) : renderText(user.healthNotes)}
        </ProfileField>

        <ProfileField label="Trenažne napomene">
          {editMode && role === "admin" ? (
            <Textarea value={formData.trainingNotes} onChange={(v)=>setFormData({...formData,trainingNotes:v})}/>
          ) : renderText(user.trainingNotes)}
        </ProfileField>
      </CollapsibleSection>
    </div>
  );
}

/* UI helpers */

function CollapsibleSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl bg-neutral-900/90 p-5 shadow">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between"
      >
        <h3 className="text-sm font-medium text-neutral-300">{title}</h3>
        <span
          className={`text-neutral-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>
      {open && <div className="mt-4 space-y-3">{children}</div>}
    </div>
  );
}

function ProfileField({ label, children }) {
  return (
    <div>
      <p className="text-xs text-neutral-400">{label}</p>
      <div className="text-sm text-white">{children}</div>
    </div>
  );
}

function Input({ value, onChange }) {
  return (
    <input
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg bg-neutral-800 p-2 text-white"
    />
  );
}

function Textarea({ value, onChange }) {
  return (
    <textarea
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="w-full rounded-lg bg-neutral-800 p-2 text-white"
    />
  );
}
