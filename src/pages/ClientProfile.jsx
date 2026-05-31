import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  return new Date(value);
}

function toInputDate(value) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function getWeekCount(startDate, endDate) {
  return Math.max(1, Math.ceil((endDate - startDate) / (7 * DAY_MS)));
}

function getFullName(profile = {}) {
  return `${profile.name || ""} ${profile.surname || ""}`.trim();
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

function toRoman(value) {
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return romans[value - 1] || value;
}

function normalizeUser(profile = {}) {
  return {
    ...profile,
    name: profile.name || "",
    surname: profile.surname || "",
    email: profile.email || "",
    phone: profile.phone || "",
    dob: toInputDate(profile.dob),
    goals: profile.goals || "",
    healthNotes: profile.healthNotes || "",
  };
}

function attachPayments(clientSubscriptions, packagesMap, billings) {
  const memberships = clientSubscriptions
    .map((subscription) => {
      const pkg = packagesMap[subscription.subscriptionId];
      if (!pkg) return null;

      const weeklyCheckIns =
        !subscription.weeklyCheckIns || subscription.weeklyCheckIns === "default"
          ? pkg.defaultCheckIns || "unlimited"
          : subscription.weeklyCheckIns;

      return {
        ...pkg,
        ...subscription,
        startDate: toDate(subscription.startDate),
        endDate: toDate(subscription.endDate),
        weeklyCheckIns,
        checkInsArray: subscription.checkInsArray || [],
        payments: [],
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.startDate - a.startDate);

  const membershipsById = Object.fromEntries(
    memberships.map((membership) => [membership.id, membership])
  );
  const legacyBillings = [];
  const unmatchedLegacyPayments = [];

  billings.forEach((billing) => {
    if (billing.clientSubscriptionId && membershipsById[billing.clientSubscriptionId]) {
      membershipsById[billing.clientSubscriptionId].payments.push(billing);
    } else {
      legacyBillings.push(billing);
    }
  });

  const packageIds = new Set([
    ...memberships.map((membership) => membership.subscriptionId),
    ...legacyBillings.map((billing) => billing.subscriptionId),
  ]);

  packageIds.forEach((packageId) => {
    const matchingMemberships = memberships
      .filter((membership) => membership.subscriptionId === packageId)
      .sort((a, b) => a.startDate - b.startDate);
    const matchingBillings = legacyBillings
      .filter((billing) => billing.subscriptionId === packageId)
      .sort((a, b) => (toDate(a.createdAt) || 0) - (toDate(b.createdAt) || 0));

    matchingBillings.forEach((billing, index) => {
      const membership = matchingMemberships[index];
      if (membership) {
        membership.payments.push({ ...billing, historicalMatch: true });
      } else {
        unmatchedLegacyPayments.push(billing);
      }
    });
  });

  return { memberships, unmatchedLegacyPayments };
}

function findOverlaps(memberships) {
  const active = memberships
    .filter((membership) => membership.active !== false)
    .sort((a, b) => a.startDate - b.startDate);
  const overlaps = [];

  for (let index = 0; index < active.length - 1; index += 1) {
    const current = active[index];
    const next = active[index + 1];
    if (current.endDate >= next.startDate) overlaps.push([current, next]);
  }

  return overlaps;
}

export default function ClientProfile() {
  const { uid: routeUid } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user: authUser, profile, loading: authLoading } = useAuth();
  const uid = routeUid === "me" ? authUser?.uid : routeUid;
  const role = profile?.role;

  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [clientSubscriptions, setClientSubscriptions] = useState([]);
  const [packagesMap, setPackagesMap] = useState({});
  const [billings, setBillings] = useState([]);
  const [bookingLastVisit, setBookingLastVisit] = useState(null);
  const [showAllSubs, setShowAllSubs] = useState(false);
  const [editingSubId, setEditingSubId] = useState("");
  const [subscriptionForm, setSubscriptionForm] = useState({});
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (authLoading || !uid) return;
    return onSnapshot(doc(db, "users", uid), (snap) => {
      if (!snap.exists()) return;
      const normalized = normalizeUser(snap.data());
      setUser(normalized);
      if (!editMode) setFormData(normalized);
    });
  }, [uid, authLoading, editMode]);

  useEffect(() => {
    if (authLoading || !uid) return;
    return onSnapshot(
      query(collection(db, "bookings"), where("userId", "==", uid)),
      (snap) => {
        const visits = snap.docs
          .map((booking) => booking.data())
          .filter((booking) => booking.checkedInAt)
          .sort((a, b) => toDate(b.checkedInAt) - toDate(a.checkedInAt));
        setBookingLastVisit(toDate(visits[0]?.checkedInAt));
      }
    );
  }, [uid, authLoading]);

  useEffect(() => {
    if (authLoading || !uid) return;
    return onSnapshot(
      query(collection(db, "clientSubscriptions"), where("userId", "==", uid)),
      (snap) => {
        setClientSubscriptions(
          snap.docs.map((subscription) => ({
            id: subscription.id,
            ...subscription.data(),
          }))
        );
      }
    );
  }, [uid, authLoading]);

  useEffect(() => {
    return onSnapshot(collection(db, "subscriptions"), (snap) => {
      setPackagesMap(
        Object.fromEntries(
          snap.docs.map((pkg) => [pkg.id, { id: pkg.id, ...pkg.data() }])
        )
      );
    });
  }, []);

  useEffect(() => {
    if (authLoading || !uid) return;
    return onSnapshot(
      query(collection(db, "billing"), where("clientId", "==", uid)),
      (snap) => {
        setBillings(
          snap.docs.map((billing) => ({
            id: billing.id,
            ...billing.data(),
          }))
        );
      }
    );
  }, [uid, authLoading]);

  const { memberships, unmatchedLegacyPayments } = useMemo(
    () => attachPayments(clientSubscriptions, packagesMap, billings),
    [clientSubscriptions, packagesMap, billings]
  );
  const overlaps = useMemo(() => findOverlaps(memberships), [memberships]);
  const lastVisit = useMemo(() => {
    const savedLastVisit = toDate(user?.lastVisitAt);
    if (!savedLastVisit) return bookingLastVisit;
    if (!bookingLastVisit) return savedLastVisit;
    return savedLastVisit > bookingLastVisit ? savedLastVisit : bookingLastVisit;
  }, [user?.lastVisitAt, bookingLastVisit]);
  const today = new Date();
  const activeSubs = memberships.filter(
    (membership) => membership.active !== false && membership.endDate >= today
  );
  const visibleSubs = showAllSubs
    ? memberships
    : activeSubs.length
      ? activeSubs
      : memberships.slice(0, 1);

  useEffect(() => {
    if (
      role !== "admin" ||
      searchParams.get("editSubscription") !== "1" ||
      editingSubId ||
      !activeSubs.length
    ) {
      return;
    }

    const membership = activeSubs[0];
    const timer = window.setTimeout(() => {
      setEditingSubId(membership.id);
      setSubscriptionForm({
        startDate: toInputDate(membership.startDate),
        endDate: toInputDate(membership.endDate),
        weeklyCheckIns: membership.weeklyCheckIns,
      });
      setSearchParams({}, { replace: true });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [role, searchParams, editingSubId, activeSubs, setSearchParams]);

  function showStatus(type, message) {
    setStatus({ type, message });
    window.setTimeout(() => setStatus(null), 3500);
  }

  function lastVisitColor() {
    if (!lastVisit) return "text-neutral-400";
    const days = (new Date() - lastVisit) / DAY_MS;
    if (days < 7) return "text-green-400";
    if (days <= 30) return "text-orange-400";
    return "text-red-400";
  }

  async function saveProfile() {
    try {
      await updateDoc(doc(db, "users", uid), {
        name: formData.name,
        surname: formData.surname,
        email: formData.email,
        phone: formData.phone,
        dob: formData.dob ? new Date(formData.dob) : null,
        goals: formData.goals,
        healthNotes: formData.healthNotes,
      });
      setEditMode(false);
      showStatus("success", "Profil je sačuvan.");
    } catch (error) {
      console.error("Profile save failed", error);
      showStatus("error", "Profil nije sačuvan. Pokušaj ponovo.");
    }
  }

  async function changeCheckIn(subId, weekIndex, delta) {
    try {
      await runTransaction(db, async (transaction) => {
        const ref = doc(db, "clientSubscriptions", subId);
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error("Membership not found");
        const checkInsArray = [...(snap.data().checkInsArray || [])];
        checkInsArray[weekIndex] = Math.max(0, (checkInsArray[weekIndex] || 0) + delta);
        transaction.update(ref, { checkInsArray });
      });
    } catch (error) {
      console.error("Manual check-in update failed", error);
      showStatus("error", "Broj dolazaka nije promenjen. Pokušaj ponovo.");
    }
  }

  function beginSubscriptionEdit(membership) {
    setEditingSubId(membership.id);
    setSubscriptionForm({
      startDate: toInputDate(membership.startDate),
      endDate: toInputDate(membership.endDate),
      weeklyCheckIns: membership.weeklyCheckIns,
    });
  }

  function extendSubscription(days) {
    const endDate = new Date(subscriptionForm.endDate);
    endDate.setDate(endDate.getDate() + days);
    setSubscriptionForm({
      ...subscriptionForm,
      endDate: toInputDate(endDate),
    });
  }

  async function saveSubscriptionEdit() {
    const membership = memberships.find((item) => item.id === editingSubId);
    if (!membership) return;

    const startDate = new Date(subscriptionForm.startDate);
    const endDate = new Date(subscriptionForm.endDate);
    if (!subscriptionForm.startDate || !subscriptionForm.endDate || endDate < startDate) {
      showStatus("error", "Proveri početni i krajnji datum.");
      return;
    }

    const weekCount = getWeekCount(startDate, endDate);
    const checkInsArray = [...membership.checkInsArray];
    if (checkInsArray.slice(weekCount).some((count) => count > 0)) {
      showStatus("error", "Ne možeš ukloniti nedelju koja već ima dolaske.");
      return;
    }

    checkInsArray.length = weekCount;
    for (let index = 0; index < weekCount; index += 1) {
      checkInsArray[index] = checkInsArray[index] || 0;
    }

    try {
      await updateDoc(doc(db, "clientSubscriptions", membership.id), {
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(endDate),
        weeklyCheckIns:
          subscriptionForm.weeklyCheckIns === "unlimited"
            ? "unlimited"
            : Number(subscriptionForm.weeklyCheckIns),
        checkInsArray,
      });
      setEditingSubId("");
      showStatus("success", "Članarina je sačuvana.");
    } catch (error) {
      console.error("Membership save failed", error);
      showStatus("error", "Članarina nije sačuvana. Pokušaj ponovo.");
    }
  }

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto max-w-[420px] space-y-5 px-1">
      {status && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            status.type === "success"
              ? "bg-green-950/70 text-green-300"
              : "bg-red-950/70 text-red-300"
          }`}
        >
          {status.message}
        </div>
      )}

      <CollapsibleSection
        header={
          <div>
            <h2 className="text-xl font-semibold text-white">{getFullName(user)}</h2>
            <p className={`mt-1 text-sm ${lastVisitColor()}`}>
              Poslednji trening: {formatDate(lastVisit)}
            </p>
          </div>
        }
      >
        <EditControls
          editMode={editMode}
          onEdit={() => setEditMode(true)}
          onSave={saveProfile}
          onCancel={() => {
            setEditMode(false);
            setFormData(user);
          }}
        />
        <ProfileField label="Ime">
          {editMode ? <Input value={formData.name} onChange={(value) => setFormData({ ...formData, name: value })} /> : user.name || "-"}
        </ProfileField>
        <ProfileField label="Prezime">
          {editMode ? <Input value={formData.surname} onChange={(value) => setFormData({ ...formData, surname: value })} /> : user.surname || "-"}
        </ProfileField>
        <ProfileField label="Email">
          {editMode ? <Input value={formData.email} onChange={(value) => setFormData({ ...formData, email: value })} /> : user.email || "-"}
        </ProfileField>
        <ProfileField label="Telefon">
          {editMode ? <Input value={formData.phone} onChange={(value) => setFormData({ ...formData, phone: value })} /> : user.phone || "-"}
        </ProfileField>
        <ProfileField label="Datum rođenja">
          {editMode ? (
            <input
              type="date"
              value={formData.dob || ""}
              onChange={(event) => setFormData({ ...formData, dob: event.target.value })}
              className="w-full rounded-lg bg-neutral-800 p-2 text-white"
            />
          ) : formatDate(user.dob)}
        </ProfileField>
      </CollapsibleSection>

      <div className="space-y-4 rounded-2xl bg-neutral-900/90 p-5 shadow">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-neutral-300">Članarina</h3>
          {role === "admin" && (
            <button
              onClick={() => navigate(`/paketi?clientId=${uid}`)}
              className="text-sm text-blue-400"
            >
              Dodaj članarinu
            </button>
          )}
        </div>

        {overlaps.length > 0 && (
          <p className="rounded-lg bg-amber-950/70 px-3 py-2 text-xs text-amber-200">
            Upozorenje: postoje članarine čiji se datumi preklapaju.
          </p>
        )}

        {visibleSubs.map((membership) => (
          <MembershipCard
            key={membership.id}
            membership={membership}
            role={role}
            editing={editingSubId === membership.id}
            form={subscriptionForm}
            setForm={setSubscriptionForm}
            onBeginEdit={() => beginSubscriptionEdit(membership)}
            onCancelEdit={() => setEditingSubId("")}
            onExtend={() => extendSubscription(7)}
            onSaveEdit={saveSubscriptionEdit}
            onChangeCheckIn={changeCheckIn}
          />
        ))}

        {!memberships.length && (
          <p className="text-sm text-neutral-500">Nema članarina.</p>
        )}

        {unmatchedLegacyPayments.length > 0 && (
          <div className="rounded-lg bg-neutral-950/70 p-3 text-sm">
            <p className="mb-2 text-xs text-amber-300">
              Starije uplate bez jasne veze sa pojedinačnom članarinom:
            </p>
            <PaymentList payments={unmatchedLegacyPayments} />
          </div>
        )}

        {memberships.length > 1 && (
          <button
            onClick={() => setShowAllSubs(!showAllSubs)}
            className="w-full text-sm text-blue-400"
          >
            {showAllSubs ? "Sakrij prethodne članarine" : "Prikaži prethodne članarine"}
          </button>
        )}
      </div>

      <CollapsibleSection title="Napomene">
        <EditControls
          editMode={editMode}
          onEdit={() => setEditMode(true)}
          onSave={saveProfile}
          onCancel={() => {
            setEditMode(false);
            setFormData(user);
          }}
        />
        <ProfileField label="Ciljevi">
          {editMode ? <Textarea value={formData.goals} onChange={(value) => setFormData({ ...formData, goals: value })} /> : user.goals || "-"}
        </ProfileField>
        <ProfileField label="Zdravlje">
          {editMode ? <Textarea value={formData.healthNotes} onChange={(value) => setFormData({ ...formData, healthNotes: value })} /> : user.healthNotes || "-"}
        </ProfileField>
      </CollapsibleSection>
    </div>
  );
}

function MembershipCard({
  membership,
  role,
  editing,
  form,
  setForm,
  onBeginEdit,
  onCancelEdit,
  onExtend,
  onSaveEdit,
  onChangeCheckIn,
}) {
  const active = membership.active !== false && membership.endDate >= new Date();
  const allowed =
    membership.weeklyCheckIns === "unlimited"
      ? "unlimited"
      : Number(membership.weeklyCheckIns);
  const weekCount = Math.max(
    membership.checkInsArray.length,
    getWeekCount(membership.startDate, membership.endDate)
  );

  return (
    <div className={`mb-3 rounded-xl border-l-4 p-4 ${active ? "border-green-500" : "border-red-500"} bg-neutral-900/80`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{membership.name}</p>
          <p className="text-sm text-neutral-400">
            {formatDate(membership.startDate)} - {formatDate(membership.endDate)}
          </p>
        </div>
        {role === "admin" && !editing && (
          <button onClick={onBeginEdit} className="shrink-0 text-sm text-blue-400">
            Izmeni
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-2 rounded-lg bg-neutral-950/70 p-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={form.startDate || ""}
              onChange={(event) => setForm({ ...form, startDate: event.target.value })}
              className="min-w-0 rounded bg-neutral-800 px-2 py-1.5 text-xs text-white"
            />
            <input
              type="date"
              value={form.endDate || ""}
              onChange={(event) => setForm({ ...form, endDate: event.target.value })}
              className="min-w-0 rounded bg-neutral-800 px-2 py-1.5 text-xs text-white"
            />
          </div>
          <select
            value={form.weeklyCheckIns}
            onChange={(event) => setForm({ ...form, weeklyCheckIns: event.target.value })}
            className="w-full rounded bg-neutral-800 px-2 py-1.5 text-xs text-white"
          >
            {[1, 2, 3, 4, 5, 6].map((count) => (
              <option key={count} value={count}>{count}x nedeljno</option>
            ))}
            <option value="unlimited">Neograničeno</option>
          </select>
          <div className="flex flex-wrap gap-3 pt-1 text-sm">
            <button onClick={onExtend} className="text-green-400">Produži 7 dana</button>
            <button onClick={onSaveEdit} className="text-blue-400">Sačuvaj</button>
            <button onClick={onCancelEdit} className="text-red-400">Otkaži</button>
          </div>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {Array.from({ length: weekCount }, (_, index) => {
          const checkIns = membership.checkInsArray[index] || 0;
          return (
            <li key={index} className="flex min-w-0 items-center gap-2">
              <span className="w-[68px] shrink-0 whitespace-nowrap text-xs text-white">
                {toRoman(index + 1)} nedelja
              </span>
              {allowed !== "unlimited" && (
                <SegmentedProgress value={checkIns} allowed={allowed} />
              )}
              <span className="ml-auto w-[42px] shrink-0 text-right text-sm font-medium text-white tabular-nums">
                {checkIns} / {allowed === "unlimited" ? "∞" : allowed}
              </span>
              {role === "admin" && (
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => onChangeCheckIn(membership.id, index, -1)} className="h-8 w-8 rounded-md bg-neutral-800 text-lg font-medium text-white hover:bg-neutral-700">-</button>
                  <button onClick={() => onChangeCheckIn(membership.id, index, 1)} className="h-8 w-8 rounded-md bg-neutral-800 text-lg font-medium text-white hover:bg-neutral-700">+</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 text-sm">
        <p className="text-neutral-400">Uplata:</p>
        {membership.payments.length ? <PaymentList payments={membership.payments} /> : <p className="text-neutral-500">-</p>}
      </div>
    </div>
  );
}

function SegmentedProgress({ value, allowed }) {
  const ratio = Math.min(value / allowed, 1);
  const activeColor =
    ratio >= 1 ? "bg-green-500" : ratio >= 0.5 ? "bg-amber-400" : "bg-red-500";

  return (
    <div className="flex min-w-0 flex-1 gap-0.5">
      {Array.from({ length: allowed }, (_, index) => (
        <span
          key={index}
          className={`h-2 min-w-0 flex-1 rounded-sm ${index < value ? activeColor : "bg-neutral-700"}`}
        />
      ))}
    </div>
  );
}

const PAYMENT_STATUS_LABELS = {
  paid: "Plaćeno",
  partially_paid: "Delimično plaćeno",
  unpaid: "Nije plaćeno",
  pending: "Na čekanju",
  cancelled: "Otkazano",
};

function PaymentList({ payments }) {
  return (
    <ul className="ml-4 list-disc">
      {payments.map((payment) => (
        <li
          key={payment.id}
          className={
            payment.status === "paid"
              ? "text-green-400"
              : payment.status === "partially_paid"
                ? "text-orange-400"
                : "text-red-400"
          }
        >
          {payment.paidAmount || 0} / {payment.amount} RSD -{" "}
          {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
        </li>
      ))}
    </ul>
  );
}

function EditControls({ editMode, onEdit, onSave, onCancel }) {
  return (
    <div className="mb-2 flex justify-end gap-4">
      {!editMode ? (
        <button onClick={onEdit} className="text-sm text-blue-400">Izmeni</button>
      ) : (
        <>
          <button onClick={onSave} className="text-sm text-blue-400">Sačuvaj</button>
          <button onClick={onCancel} className="text-sm text-red-400">Otkaži</button>
        </>
      )}
    </div>
  );
}

function CollapsibleSection({ title, header, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-neutral-900/90 p-5 shadow">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <div>{header || <h3 className="text-sm font-medium text-neutral-300">{title}</h3>}</div>
        <span className={`pb-2 text-2xl text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
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
  return <input value={value || ""} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg bg-neutral-800 p-2 text-white" />;
}

function Textarea({ value, onChange }) {
  return <textarea value={value || ""} onChange={(event) => onChange(event.target.value)} rows={3} className="w-full rounded-lg bg-neutral-800 p-2 text-white" />;
}
