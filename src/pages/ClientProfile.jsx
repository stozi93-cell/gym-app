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
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Avatar from "../components/Avatar";
import PhotoCropModal from "../components/PhotoCropModal";
import { Panel, SegmentedControl, StatusPill } from "../components/ui/Primitives";
import ScrollArea from "../components/ui/ScrollArea";
import { db, storage } from "../firebase";
import { useAuth } from "../context/AuthContext";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECKIN_HISTORY_DAYS = 30;
const PROFILE_TABS = [
  { value: "checkins", label: "Dolasci" },
  { value: "subscriptions", label: "Članarine" },
  { value: "info", label: "Podaci" },
  { value: "notes", label: "Napomene" },
];

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

function formatCompactDate(value) {
  const date = toDate(value);
  const formatted = date
    ? date.toLocaleDateString("sr-Latn-RS", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "-";
  return formatted.replace(/\.$/, "");
}

function formatShortDate(value) {
  const date = toDate(value);
  return date
    ? date.toLocaleDateString("sr-Latn-RS", {
        day: "2-digit",
        month: "2-digit",
      })
    : "-";
}

function getWeekRange(membership, weekIndex) {
  const start = new Date(membership.startDate);
  start.setDate(start.getDate() + weekIndex * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  if (end > membership.endDate) return `${formatShortDate(start)} - ${formatShortDate(membership.endDate)}`;
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
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
    photoURL: profile.photoURL || "",
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

function isVisitInMembership(visit, membership) {
  const visitDate = toDate(visit.slotTimestamp) || toDate(visit.checkedInAt);
  if (!visitDate) return false;

  const start = new Date(membership.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(membership.endDate);
  end.setHours(23, 59, 59, 999);

  return visitDate >= start && visitDate <= end;
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
  const [checkInHistory, setCheckInHistory] = useState([]);
  const [showAllSubs, setShowAllSubs] = useState(false);
  const [editingSubId, setEditingSubId] = useState("");
  const [subscriptionForm, setSubscriptionForm] = useState({});
  const [status, setStatus] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [cropImageURL, setCropImageURL] = useState("");
  const [activeProfileTab, setActiveProfileTab] = useState("checkins");
  const canUploadPhoto = authUser?.uid === uid;

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
    return () => {
      if (cropImageURL) URL.revokeObjectURL(cropImageURL);
    };
  }, [cropImageURL]);

  useEffect(() => {
    if (authLoading || !uid) return;
    return onSnapshot(
      query(collection(db, "bookings"), where("userId", "==", uid)),
      (snap) => {
        const historyCutoff = new Date(Date.now() - CHECKIN_HISTORY_DAYS * DAY_MS);
        const visits = snap.docs
          .map((booking) => ({ id: booking.id, ...booking.data() }))
          .filter((booking) => {
            const checkedInAt = toDate(booking.checkedInAt);
            return checkedInAt && checkedInAt >= historyCutoff;
          })
          .sort((a, b) => toDate(b.checkedInAt) - toDate(a.checkedInAt));
        setBookingLastVisit(toDate(visits[0]?.checkedInAt));
        setCheckInHistory(visits);
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
  const activeCheckInHistory = checkInHistory.filter((visit) =>
    activeSubs.some((membership) => isVisitInMembership(visit, membership))
  );
  const currentSubs = activeSubs.length
    ? activeSubs
    : memberships.slice(0, 1);
  const visibleSubscriptionSubs = showAllSubs
    ? memberships
    : currentSubs;

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
      setActiveProfileTab("subscriptions");
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

  function closePhotoCrop() {
    if (cropImageURL) URL.revokeObjectURL(cropImageURL);
    setCropImageURL("");
  }

  function chooseProfilePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showStatus("error", "Izaberi fotografiju.");
      return;
    }

    if (file.size >= 25 * 1024 * 1024) {
      showStatus("error", "Fotografija mora biti manja od 25 MB.");
      return;
    }

    if (cropImageURL) URL.revokeObjectURL(cropImageURL);
    setCropImageURL(URL.createObjectURL(file));
  }

  async function uploadProfilePhoto(avatar) {
    try {
      setUploadingPhoto(true);
      const avatarRef = ref(storage, `profilePhotos/${uid}/avatar`);
      await uploadBytes(avatarRef, avatar, {
        contentType: "image/jpeg",
        cacheControl: "public,max-age=3600",
      });
      const downloadURL = await getDownloadURL(avatarRef);
      const versionedURL = `${downloadURL}${downloadURL.includes("?") ? "&" : "?"}v=${Date.now()}`;
      await updateDoc(doc(db, "users", uid), { photoURL: versionedURL });
      closePhotoCrop();
      showStatus("success", "Profilna fotografija je sačuvana.");
      return true;
    } catch (error) {
      console.error("Profile photo upload failed", error);
      showStatus("error", "Fotografija nije sačuvana. Pokušaj ponovo.");
      return false;
    } finally {
      setUploadingPhoto(false);
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
    setActiveProfileTab("subscriptions");
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
          className={`rounded-xl border px-4 py-3 text-sm ${
            status.type === "success"
              ? "border-brand-green-500/20 bg-brand-green-500/10 text-brand-green-300"
              : "border-red-400/20 bg-red-500/10 text-red-300"
          }`}
        >
          {status.message}
        </div>
      )}
      {cropImageURL && (
        <PhotoCropModal
          imageURL={cropImageURL}
          onCancel={closePhotoCrop}
          onSave={uploadProfilePhoto}
          onError={() => showStatus("error", "Fotografija nije obrađena. Izaberi drugu fotografiju.")}
        />
      )}

      <Panel className="p-4">
        <div className="flex items-center gap-4">
          {canUploadPhoto ? (
            <label className="relative shrink-0 cursor-pointer rounded-full transition hover:ring-2 hover:ring-brand-blue-500">
              <Avatar
                name={getFullName(user)}
                photoURL={user.photoURL}
                className="h-16 w-16 text-lg"
              />
              {uploadingPhoto && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-[10px] font-medium text-white">
                  Čuvanje
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                disabled={uploadingPhoto}
                onChange={chooseProfilePhoto}
                className="hidden"
              />
            </label>
          ) : (
            <Avatar
              name={getFullName(user)}
              photoURL={user.photoURL}
              className="h-16 w-16 text-lg"
            />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold text-white">
              {getFullName(user)}
            </h2>
            <p className={`mt-1 text-sm ${lastVisitColor()}`}>
              Poslednji trening: {formatCompactDate(lastVisit)}
            </p>
            {role === "admin" && (
              <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill tone={activeSubs.length ? "green" : "red"}>
                {activeSubs.length ? "Aktivna članarina" : "Bez članarine"}
              </StatusPill>
              {memberships.length > 1 && (
                <StatusPill tone="neutral">
                  {memberships.length} članarine
                </StatusPill>
              )}
              </div>
            )}
          </div>
        </div>
      </Panel>

          <SegmentedControl
        options={PROFILE_TABS}
        value={activeProfileTab}
        onChange={setActiveProfileTab}
      />

      {activeProfileTab === "checkins" && (
        <div className="space-y-3">
          {activeSubs.length > 0 ? (
            activeSubs.map((membership) => (
              <MembershipCard
                key={membership.id}
                variant="checkins"
                membership={membership}
                role={role}
                editing={false}
                form={subscriptionForm}
                setForm={setSubscriptionForm}
                onBeginEdit={() => beginSubscriptionEdit(membership)}
                onCancelEdit={() => setEditingSubId("")}
                onExtend={() => extendSubscription(7)}
                onSaveEdit={saveSubscriptionEdit}
                onChangeCheckIn={changeCheckIn}
              />
            ))
          ) : (
            <Panel className="p-4 text-sm text-neutral-400">
              {role === "admin"
                ? "Klijent nema aktivnih članarina."
                : "Nemate aktivnih članarina."}
            </Panel>
          )}

          {activeSubs.length > 0 && (
            <CheckInHistory visits={activeCheckInHistory} />
          )}
        </div>
      )}

      {activeProfileTab === "subscriptions" && (
        <Panel className="space-y-4 p-5">
          {role === "admin" && (
            <div className="flex justify-end">
              <button
                onClick={() => navigate(`/paketi?clientId=${uid}`)}
                className="rounded-xl border border-brand-blue-500/25 bg-brand-blue-500/10 px-3 py-2 text-xs font-medium text-brand-blue-300"
              >
                Dodaj članarinu
              </button>
            </div>
          )}

          {overlaps.length > 0 && (
            <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              Upozorenje: postoje članarine čiji se datumi preklapaju.
            </p>
          )}

          {visibleSubscriptionSubs.map((membership) => (
            <MembershipCard
              key={membership.id}
              variant="subscriptions"
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
            <div className="rounded-xl border border-white/10 bg-neutral-950/70 p-3 text-sm">
              <p className="mb-2 text-xs text-amber-300">
                Starije uplate bez jasne veze sa pojedinačnom članarinom:
              </p>
              <PaymentList payments={unmatchedLegacyPayments} />
            </div>
          )}

          {memberships.length > 1 && (
            <button
              onClick={() => setShowAllSubs(!showAllSubs)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-brand-blue-300"
            >
              {showAllSubs ? "Sakrij prethodne članarine" : "Prikaži prethodne članarine"}
            </button>
          )}
        </Panel>
      )}

      {activeProfileTab === "info" && (
        <Panel className="p-4">
          <div className={editMode ? "space-y-2" : "divide-y divide-white/10"}>
          <ProfileField label="Ime" compact={!editMode}>
            {editMode ? <Input value={formData.name} onChange={(value) => setFormData({ ...formData, name: value })} /> : user.name || "-"}
          </ProfileField>
          <ProfileField label="Prezime" compact={!editMode}>
            {editMode ? <Input value={formData.surname} onChange={(value) => setFormData({ ...formData, surname: value })} /> : user.surname || "-"}
          </ProfileField>
          <ProfileField label="Email" compact={!editMode}>
            {editMode ? <Input value={formData.email} onChange={(value) => setFormData({ ...formData, email: value })} /> : user.email || "-"}
          </ProfileField>
          <ProfileField label="Telefon" compact={!editMode}>
            {editMode ? <Input value={formData.phone} onChange={(value) => setFormData({ ...formData, phone: value })} /> : user.phone || "-"}
          </ProfileField>
          <ProfileField label="Datum rođenja" compact={!editMode}>
            {editMode ? (
              <input
                type="date"
                value={formData.dob || ""}
                onChange={(event) => setFormData({ ...formData, dob: event.target.value })}
                className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2 text-white outline-none focus:border-brand-blue-500"
              />
            ) : formatDate(user.dob)}
          </ProfileField>
          </div>
          <EditControls
            editMode={editMode}
            onEdit={() => setEditMode(true)}
            onSave={saveProfile}
            onCancel={() => {
              setEditMode(false);
              setFormData(user);
            }}
          />
        </Panel>
      )}

      {activeProfileTab === "notes" && (
        <Panel className="space-y-3 p-5">
          <ProfileField label="Ciljevi" preserveWhitespace={!editMode}>
            {editMode ? <Textarea value={formData.goals} onChange={(value) => setFormData({ ...formData, goals: value })} /> : user.goals || "-"}
          </ProfileField>
          <ProfileField label="Zdravlje" preserveWhitespace={!editMode}>
            {editMode ? <Textarea value={formData.healthNotes} onChange={(value) => setFormData({ ...formData, healthNotes: value })} /> : user.healthNotes || "-"}
          </ProfileField>
          <EditControls
            editMode={editMode}
            onEdit={() => setEditMode(true)}
            onSave={saveProfile}
            onCancel={() => {
              setEditMode(false);
              setFormData(user);
            }}
          />
        </Panel>
      )}
    </div>
  );
}

function CheckInHistory({ visits }) {
  const [open, setOpen] = useState(false);

  return (
    <Panel className="p-4">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
          Istorija dolazaka
        </span>
        <span className="flex items-center gap-2">
          <StatusPill tone="neutral">{visits.length}</StatusPill>
          <span className={`text-sm text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}>
            ˅
          </span>
        </span>
      </button>

      {open && visits.length > 0 && (
        <ScrollArea containerClassName="mt-3" className="max-h-64 space-y-2 pr-1">
          {visits.map((visit) => (
            <li
              key={visit.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
            >
              <span className="text-neutral-200">
                {formatDate(visit.slotTimestamp)}
              </span>
              <span className="text-xs text-neutral-400">
                {toDate(visit.slotTimestamp)?.toLocaleTimeString("sr-Latn-RS", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ScrollArea>
      )}

      {open && visits.length === 0 && (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-neutral-500">
          Nema evidentiranih dolazaka.
        </p>
      )}
    </Panel>
  );
}

function MembershipCard({
  variant = "full",
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
  const showCheckIns = variant !== "subscriptions";
  const showSubscriptionDetails = variant !== "checkins";
  const cardTone = showSubscriptionDetails
    ? active
      ? "border-brand-green-500/30 bg-brand-green-500/5"
      : "border-red-400/30 bg-red-500/10"
    : "border-white/10 bg-neutral-900/70";

  return (
    <div className={`rounded-2xl border p-4 ${cardTone}`}>
      {showSubscriptionDetails && (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{membership.name}</p>
          <p className="text-sm text-neutral-400">
            {formatCompactDate(membership.startDate)} - {formatCompactDate(membership.endDate)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusPill tone={active ? "green" : "red"}>
            {active ? "Aktivna" : "Istekla"}
          </StatusPill>
          {role === "admin" && !editing && showSubscriptionDetails && (
            <button onClick={onBeginEdit} className="shrink-0 rounded-xl border border-brand-blue-500/25 bg-brand-blue-500/10 px-3 py-2 text-xs font-medium text-brand-blue-300">
              Izmeni
            </button>
          )}
        </div>
      </div>
      )}

      {showSubscriptionDetails && editing && (
        <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-neutral-950/70 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 text-xs text-neutral-400">
              Početak
              <input
                type="date"
                value={form.startDate || ""}
                onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                className="mt-1 w-full min-w-0 rounded-xl border border-white/10 bg-neutral-900 px-2 py-2 text-xs text-white outline-none focus:border-brand-blue-500"
              />
            </label>
            <label className="min-w-0 text-xs text-neutral-400">
              Kraj
              <input
                type="date"
                value={form.endDate || ""}
                onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                className="mt-1 w-full min-w-0 rounded-xl border border-white/10 bg-neutral-900 px-2 py-2 text-xs text-white outline-none focus:border-brand-blue-500"
              />
            </label>
          </div>
          <select
            value={form.weeklyCheckIns}
            onChange={(event) => setForm({ ...form, weeklyCheckIns: event.target.value })}
            className="w-full rounded-xl border border-white/10 bg-neutral-900 px-2 py-2 text-xs text-white outline-none focus:border-brand-blue-500"
          >
            {[1, 2, 3, 4, 5, 6].map((count) => (
              <option key={count} value={count}>{count}x nedeljno</option>
            ))}
            <option value="unlimited">Neograničeno</option>
          </select>
          <div className="flex flex-wrap gap-2 pt-1 text-sm">
            <button onClick={onExtend} className="rounded-xl border border-brand-green-500/25 bg-brand-green-500/10 px-3 py-2 text-xs font-medium text-brand-green-300">Produži 7 dana</button>
            <button onClick={onSaveEdit} className="rounded-xl border border-brand-blue-500/25 bg-brand-blue-500/10 px-3 py-2 text-xs font-medium text-brand-blue-300">Sačuvaj</button>
            <button onClick={onCancelEdit} className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">Otkaži</button>
          </div>
        </div>
      )}

      {showCheckIns && (
        <ul className={showSubscriptionDetails ? "mt-3 space-y-2" : "space-y-2"}>
          {Array.from({ length: weekCount }, (_, index) => {
            const checkIns = membership.checkInsArray[index] || 0;
            return (
              <li key={index} className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <span className="w-[98px] shrink-0 text-xs text-white">
                  <span className="block whitespace-nowrap">{toRoman(index + 1)} nedelja</span>
                  <span className="block whitespace-nowrap text-[10px] text-neutral-400">
                    {getWeekRange(membership, index)}
                  </span>
                </span>
                {allowed !== "unlimited" && (
                  <SegmentedProgress value={checkIns} allowed={allowed} />
                )}
                <span className="ml-auto w-[42px] shrink-0 text-right text-sm font-medium text-white tabular-nums">
                  {checkIns} / {allowed === "unlimited" ? "∞" : allowed}
                </span>
                {role === "admin" && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => onChangeCheckIn(membership.id, index, -1)} className="h-8 w-8 rounded-lg border border-white/10 bg-neutral-900 text-lg font-medium text-white hover:bg-neutral-800">-</button>
                    <button onClick={() => onChangeCheckIn(membership.id, index, 1)} className="h-8 w-8 rounded-lg border border-white/10 bg-neutral-900 text-lg font-medium text-white hover:bg-neutral-800">+</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showSubscriptionDetails && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
          <p className="text-neutral-400">Uplata:</p>
          {membership.payments.length ? <PaymentList payments={membership.payments} /> : <p className="text-neutral-500">-</p>}
        </div>
      )}
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
    <ul className="mt-2 space-y-1">
      {payments.map((payment) => (
        <li
          key={payment.id}
          className={`rounded-lg border px-3 py-2 text-xs ${
            payment.status === "paid"
              ? "border-brand-green-500/25 bg-brand-green-500/10 text-brand-green-300"
              : payment.status === "partially_paid"
                ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
                : "border-red-400/25 bg-red-500/10 text-red-300"
          }`}
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
    <div className="mt-3 flex justify-end gap-2">
      {!editMode ? (
        <button onClick={onEdit} className="rounded-xl border border-brand-blue-500/25 bg-brand-blue-500/10 px-3 py-2 text-xs font-medium text-brand-blue-300">Izmeni</button>
      ) : (
        <>
          <button onClick={onSave} className="rounded-xl border border-brand-blue-500/25 bg-brand-blue-500/10 px-3 py-2 text-xs font-medium text-brand-blue-300">Sačuvaj</button>
          <button onClick={onCancel} className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">Otkaži</button>
        </>
      )}
    </div>
  );
}

function ProfileField({ label, children, compact = false, preserveWhitespace = false }) {
  if (compact) {
    return (
      <div className="flex min-w-0 items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
        <p className="shrink-0 text-xs text-neutral-400">{label}</p>
        <div className="min-w-0 max-w-[68%] truncate text-right text-sm text-white">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-xs text-neutral-400">{label}</p>
      <div className={`mt-1 text-sm text-white ${preserveWhitespace ? "whitespace-pre-wrap break-words" : ""}`}>
        {children}
      </div>
    </div>
  );
}

function Input({ value, onChange }) {
  return <input value={value || ""} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2 text-white outline-none focus:border-brand-blue-500" />;
}

function Textarea({ value, onChange }) {
  return <textarea value={value || ""} onChange={(event) => onChange(event.target.value)} rows={3} className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2 text-white outline-none focus:border-brand-blue-500" />;
}
