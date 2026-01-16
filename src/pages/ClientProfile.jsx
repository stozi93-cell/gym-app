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

      let weeklyCheckIns = cs.weeklyCheckIns;
      if (!weeklyCheckIns || weeklyCheckIns === "default") {
        weeklyCheckIns = pkg.defaultCheckIns || "unlimited";
      }

      const billingSnap = await getDocs(
        query(
          collection(db, "billing"),
          where("clientId", "==", uid),
          where("subscriptionId", "==", cs.subscriptionId)
        )
      );

      subs.push({
        id: d.id,
        ...pkg,
        startDate: cs.startDate.toDate(),
        endDate: cs.endDate.toDate(),
        active: cs.active,
        checkInsArray: cs.checkInsArray || [],
        weeklyCheckIns,
        payments: billingSnap.docs.map((b) => ({ id: b.id, ...b.data() })),
      });
    }

    subs.sort((a, b) => b.startDate - a.startDate);
    setSubscriptions(subs);
  }

  if (authLoading || !user) {
    return <div className="p-6 text-neutral-400">Učitavanje…</div>;
  }

  /* helpers */

  const toRoman = (n) => {
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return romans[n - 1] || n;
};

  const formatDate = (d) =>
    d
      ? new Date(d).toLocaleDateString("sr-Latn-RS", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";

      const formatShortDate = (d) =>
  new Date(d).toLocaleDateString("sr-Latn-RS", {
    day: "2-digit",
    month: "long",
  });

  const formatShortDate3 = (d) =>
  new Date(d).toLocaleDateString("sr-Latn-RS", {
    day: "2-digit",
    month: "short",
  });

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
const PAYMENT_STATUS_LABELS = {
  paid: "Plaćeno",
  partially_paid: "Delimično plaćeno",
  unpaid: "Nije plaćeno",
  pending: "Na čekanju",
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
      {/* HEADER + PERSONAL INFO */}
      {/* HEADER */}
<CollapsibleSection
  header={
    <div className="flex items-start justify-between">
      <div>
        <h2 className="text-xl font-semibold text-white">
          {user.name} {user.surname}
        </h2>
        <p className={`mt-1 text-sm ${lastVisitColor()}`}>
          Poslednji trening: {formatDate(lastVisit)}
        </p>
      </div>

      {/* EDIT CONTROLS */}
      
    </div>
  }
  defaultOpen={false}
>
<div className="flex justify-end gap-4 mb-2">
  {!editMode ? (
    <button
      onClick={() => setEditMode(true)}
      className="text-sm text-blue-400"
    >
    Izmeni
    </button>
  ) : (
    <>
      <button
        onClick={saveProfile}
        className="text-sm text-blue-400"
      >
        ✔️ Sačuvaj
      </button>
      <button
        onClick={() => {
          setEditMode(false);
          setFormData(user);
        }}
        className="text-sm text-red-400"
      >
        ✖️ Otkaži
      </button>
    </>
  )}
</div>

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

      {/* PRETPLATE */}
      <CollapsibleSection title="Članarina" defaultOpen>
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
                  <li key={i} className="flex items-center gap-3">
  {(() => {
    const ws = new Date(s.startDate);
    ws.setDate(ws.getDate() + i * 7);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);

    return (
      <>
        {/* FIXED-WIDTH LABEL */}
        <span className="w-40 shrink-0 text-white-400">
          {toRoman(i + 1)} nedelja
          <span className="ml-1 text-xs text-neutral-400">
            ({formatShortDate3(ws)} – {formatShortDate3(we)})
          </span>
        </span>

        {/* RIGHT-ALIGNED VALUE */}
        {allowed !== "∞" && (
  <div className="mt-0 ml-0 w-11 h-1.5 rounded bg-neutral-700 overflow-hidden">
    <div
      className="h-full bg-green-500"
      style={{
        width: `${Math.min(((c || 0) / allowed) * 100, 100)}%`,
      }}
    />
  </div>
)}
        <span className="ml-auto font-medium text-white">
          {c || 0} / {allowed}
        </span>
        
      </>
    );
  })()}


                    {role === "admin" && (
                      <span className="flex gap-2">
                        <button onClick={()=>changeCheckIn(s.id,i,1)}>+</button>
                        <button onClick={()=>changeCheckIn(s.id,i,-1)}>-</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-3 text-sm">
                <p className="text-neutral-400">Uplata:</p>
                {s.payments?.length ? (
                  <ul className="ml-4 list-disc">
                    {s.payments.map((p) => (
                      <li key={p.id} className={paymentColor(p.status)}>
                        {p.paidAmount || 0} / {p.amount} RSD —{" "}
{PAYMENT_STATUS_LABELS[p.status] ?? p.status}
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
              ? "Sakrij prethodne članarine"
              : "Prikaži prethodne članarine"}
          </button>
        )}
      </CollapsibleSection>

      {/* NAPOMENE */}
      <CollapsibleSection title="Napomene">
      <div className="flex justify-end gap-4 mb-2">
  {!editMode ? (
    <button
      onClick={() => setEditMode(true)}
      className="text-sm text-blue-400"
    >
     Izmeni
    </button>
  ) : (
    <>
      <button
        onClick={saveProfile}
        className="text-sm text-blue-400"
      >
        ✔️ Sačuvaj
      </button>
      <button
        onClick={() => {
          setEditMode(false);
          setFormData(user);
        }}
        className="text-sm text-red-400"
      >
        ✖️ Otkaži
      </button>
    </>
  )}
</div>

        <ProfileField label="Ciljevi">
          {editMode ? (
            <Textarea value={formData.goals} onChange={(v)=>setFormData({...formData,goals:v})}/>
          ) : renderText(user.goals)}
        </ProfileField>

        <ProfileField label="Zdravlje">
          {editMode ? (
            <Textarea value={formData.healthNotes} onChange={(v)=>setFormData({...formData,healthNotes:v})}/>
          ) : renderText(user.healthNotes)}
        </ProfileField>
      </CollapsibleSection>
    </div>
  );
}

/* UI helpers */

function CollapsibleSection({ title, header, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl bg-neutral-900/90 p-5 shadow">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          {header || <h3 className="text-sm font-medium text-neutral-300">{title}</h3>}
        </div>
        <span
  className={`text-neutral-400 text-2xl transition-transform ${
    open ? "rotate-180" : ""
  }`}
>
  ⌄
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
