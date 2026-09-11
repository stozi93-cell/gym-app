import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  updateDoc,
  setDoc,
  where,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../firebase";
import Avatar from "../components/Avatar";
import { Panel, StatusPill } from "../components/ui/Primitives";
import DayPicker, {
  buildDayPickerDays,
  dateFromDayKey,
  makeDayKey,
} from "../components/ui/DayPicker";
import {
  bookSlot as createBooking,
  getBookingErrorMessage,
  getTemplateSlotId,
} from "../bookings/bookSlot";
import { checkInBooking } from "../bookings/checkInBooking";
import {
  getCapacity,
  countBookingsByTimestamp,
  getSlotAvailability,
} from "../../functions/bookings/capacity.mjs";

const MANUAL_SLOT_CAPACITY = 4;
const WINDOW_DAYS = 7;

function LockIcon({ locked }) {
  return locked ? (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

/* ─────────────────────────────
   Slot generation (shared model)
───────────────────────────── */
function generateSlotsFromTemplates(templates, startDate, days) {
  const out = [];

  for (let i = 0; i < days; i++) {
    const base = new Date(startDate);
    base.setDate(base.getDate() + i);
    const weekday = base.getDay();

    templates.forEach((tpl) => {
      if (!tpl.active) return;
      if (!tpl.days.includes(weekday)) return;

      const [h, m] = tpl.time.split(":");
      const d = new Date(base);
      d.setHours(Number(h), Number(m), 0, 0);

      out.push({
        id: `tpl_${tpl.id}_${d.toISOString()}`,
        timestamp: d,
        generated: true,
        templateId: tpl.id,
        capacity: getCapacity(tpl.capacity),
        locked: false, // default, overridden if real slot exists
      });
    });
  }

  return out;
}

export default function AdminSlots() {
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [selectedDayKey, setSelectedDayKey] = useState(() =>
    makeDayKey(new Date())
  );
  const [pendingBookingIds, setPendingBookingIds] = useState([]);
  const pendingBookingIdsRef = useRef(new Set());
  const [statusMessage, setStatusMessage] = useState("");
  const [bookingSlot, setBookingSlot] = useState(null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientBookingPending, setClientBookingPending] = useState(false);
  const loadRequestRef = useRef(0);
  const countsByTimestamp = useMemo(
    () => countBookingsByTimestamp(bookings, slots),
    [bookings, slots]
  );

  useEffect(() => {
  if (filterDate) {
    setSelectedDayKey(filterDate);
    loadData(dateFromDayKey(filterDate));
  } else {
    setSelectedDayKey(makeDayKey(new Date()));
    loadData();
  }
}, [filterDate]);

  useEffect(() => {
    return onSnapshot(collection(db, "bookings"), (snapshot) => {
      setBookings(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
    });
  }, []);

  useEffect(() => {
    let initialSnapshotsRemaining = 2;
    let timer;
    const refreshSlots = () => {
      if (initialSnapshotsRemaining > 0) {
        initialSnapshotsRemaining -= 1;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => loadData(filterDate ? dateFromDayKey(filterDate) : undefined, true), 150);
    };
    const unsubSlots = onSnapshot(collection(db, "slots"), refreshSlots);
    const unsubTemplates = onSnapshot(collection(db, "slotTemplates"), refreshSlots);
    return () => {
      clearTimeout(timer);
      unsubSlots();
      unsubTemplates();
    };
  }, [filterDate]);

  async function loadData(dateOverride, background = false) {
    const requestId = ++loadRequestRef.current;
    if (!background) setLoading(true);
    try {

    const startDate = dateOverride
  ? new Date(dateOverride)
  : new Date();

startDate.setHours(0, 0, 0, 0);

const endDate = new Date(startDate);
endDate.setDate(startDate.getDate() + WINDOW_DAYS);

const start = Timestamp.fromDate(startDate);
const end = Timestamp.fromDate(endDate);

    const tplSnap = await getDocs(collection(db, "slotTemplates"));
    const tplData = tplSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const slotSnap = await getDocs(
      query(
        collection(db, "slots"),
        where("timestamp", ">=", start),
        where("timestamp", "<=", end),
        orderBy("timestamp")
      )
    );

    const realSlots = slotSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      capacity: getCapacity(d.data().capacity),
      timestamp: d.data().timestamp.toDate(),
      generated: false,
    }));

    const templateSlots = generateSlotsFromTemplates(
  tplData,
  startDate,
  WINDOW_DAYS
);

const mergedTemplateSlots = templateSlots.map((tplSlot) => {
  const matchingRealSlots = realSlots.filter(
    (r) => r.timestamp.getTime() === tplSlot.timestamp.getTime()
  );
  const real = matchingRealSlots[0];

  return real
    ? {
        ...tplSlot,
        id: real.id,
        slotIds: matchingRealSlots.map((slot) => slot.id),
        locked: matchingRealSlots.some((slot) => slot.locked),
        generated: false,
      }
    : tplSlot;
});

const manualSlots = realSlots.filter(
  (real) =>
    !templateSlots.some(
      (tplSlot) =>
        tplSlot.timestamp.getTime() === real.timestamp.getTime()
    )
);

const nextSlots = [...mergedTemplateSlots, ...manualSlots].sort(
    (a, b) => a.timestamp - b.timestamp
);

    const userSnap = await getDocs(collection(db, "users"));
    const subSnap = await getDocs(
      query(
        collection(db, "clientSubscriptions"),
        where("active", "==", true)
      )
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeSubUserIds = new Set();

    subSnap.docs.forEach((subscription) => {
      const data = subscription.data();
      const endDate = data.endDate?.toDate
        ? data.endDate.toDate()
        : new Date(data.endDate);

      if (endDate >= today) {
        activeSubUserIds.add(data.userId);
      }
    });

    if (requestId !== loadRequestRef.current) return;
    setSlots(nextSlots);
    setUsers(
      userSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          hasActiveSub:
            data.role === "client" ? activeSubUserIds.has(d.id) : true,
        };
      })
    );

    } catch {
      if (requestId === loadRequestRef.current) {
        setStatusMessage("Raspored nije učitan. Proverite vezu i osvežite stranicu.");
      }
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }

  /* helpers */
  const slotBookings = (slot) => {
    const slotIds = slot.slotIds || [slot.id];
    return bookings.filter((b) =>
      slotIds.includes(b.slotId) || b.slotTimestamp?.toMillis() === slot.timestamp.getTime()
    );
  };
  const beginBookingAction = (bookingId) => {
    if (pendingBookingIdsRef.current.has(bookingId)) return false;

    pendingBookingIdsRef.current.add(bookingId);
    setPendingBookingIds(Array.from(pendingBookingIdsRef.current));
    return true;
  };
  const finishBookingAction = (bookingId) => {
    pendingBookingIdsRef.current.delete(bookingId);
    setPendingBookingIds(Array.from(pendingBookingIdsRef.current));
  };

  async function materializeSlot(slot, extra = {}) {
    if (!slot.generated) return slot.id;

    const ref = doc(
      db,
      "slots",
      getTemplateSlotId(slot.templateId, slot.timestamp)
    );

    await setDoc(ref, {
      timestamp: slot.timestamp,
      capacity: slot.capacity,
      createdFromTemplate: slot.templateId,
      locked: false,
      ...extra,
    });

    return ref.id;
  }

  /* actions */
  async function createSlot() {
    if (!date || !time) return;

    await addDoc(collection(db, "slots"), {
      timestamp: new Date(`${date}T${time}:00`),
      capacity: MANUAL_SLOT_CAPACITY,
      locked: false,
    });

    setDate("");
    setTime("");
    loadData(filterDate ? new Date(filterDate) : undefined);
  }

  async function adminBook(slot, userId) {
    if (!userId) return false;

    try {
      const result = await createBooking({
        slot,
        userId,
        adminOverride: true,
      });
      setStatusMessage(result.overCapacity
        ? "Rezervacija je sačuvana preko uobičajenog limita."
        : "Rezervacija je sačuvana."
      );
      return true;
    } catch (error) {
      const message = getBookingErrorMessage(error);
      setStatusMessage(message);
      alert(message);
      return false;
    }
  }

  async function selectClient(userId) {
    if (!bookingSlot || clientBookingPending) return;

    setClientBookingPending(true);
    const saved = await adminBook(bookingSlot, userId);
    setClientBookingPending(false);

    if (saved) {
      setBookingSlot(null);
      setClientSearch("");
    }
  }

  async function toggleLock(slot) {
    if (slot.generated) {
      await materializeSlot(slot, { locked: true });
    } else {
      await updateDoc(doc(db, "slots", slot.id), {
        locked: !slot.locked,
      });
    }

    loadData(filterDate ? new Date(filterDate) : undefined);
  }

  async function handleCheckIn(booking) {
    if (booking.checkedIn || !beginBookingAction(booking.id)) return;

    try {
      await checkInBooking(booking.id);
      setStatusMessage("Klijent je cekiran.");
    } catch (error) {
      const message =
        error.message || "Cekiranje nije uspelo. Pokusajte ponovo.";
      setStatusMessage(message);
      alert(message);
    } finally {
      finishBookingAction(booking.id);
    }
  }

  async function cancelBooking(b) {
    if (!beginBookingAction(b.id)) return;

    try {
      await deleteDoc(doc(db, "bookings", b.id));
      setStatusMessage("Rezervacija je otkazana.");
    } catch (error) {
      const message =
        error.message || "Otkazivanje nije uspelo. Pokusajte ponovo.";
      setStatusMessage(message);
      alert(message);
    } finally {
      finishBookingAction(b.id);
    }
  }

  /* grouping */
  const groupedSlots = slots.reduce((acc, s) => {
    const key = makeDayKey(s.timestamp);
    (acc[key] ||= []).push(s);
    return acc;
  }, {});

  const dayPickerStart = filterDate ? dateFromDayKey(filterDate) : new Date();
  const dayPickerDays = buildDayPickerDays(dayPickerStart, 6);
  const dayPickerKeys = dayPickerDays.map((day) => day.key).join("|");
  useEffect(() => {
    if (
      dayPickerDays.length &&
      !dayPickerDays.some((day) => day.key === selectedDayKey)
    ) {
      setSelectedDayKey(dayPickerDays[0].key);
    }
  }, [dayPickerKeys, selectedDayKey]);

  const todayKey = makeDayKey(new Date());
  const dayMetaByKey = dayPickerDays.reduce((acc, day) => {
    const daySlots = groupedSlots[day.key] || [];
    const bookingCount = daySlots.reduce(
      (sum, slot) => sum + slotBookings(slot).length,
      0
    );

    acc[day.key] = {
      today: day.key === todayKey,
      label: bookingCount > 0 || daySlots.length > 0,
      tone: bookingCount > 0 ? "blue" : "neutral",
    };
    return acc;
  }, {});
  const selectedDaySlots = [...(groupedSlots[selectedDayKey] || [])].sort(
    (a, b) => a.timestamp - b.timestamp
  );
  const matchingUsers = useMemo(() => {
    const search = clientSearch.trim().toLocaleLowerCase("sr-Latn-RS");

    return [...users]
      .sort((a, b) =>
        `${a.name || ""} ${a.surname || ""}`.localeCompare(
          `${b.name || ""} ${b.surname || ""}`,
          "sr-Latn-RS"
        )
      )
      .filter((user) => {
        if (!search) return true;

        return `${user.name || ""} ${user.surname || ""} ${user.email || ""} ${user.phone || ""}`
          .toLocaleLowerCase("sr-Latn-RS")
          .includes(search);
      });
  }, [clientSearch, users]);

  if (loading) {
  return (
    <div className="space-y-4">
      <div className="h-4 w-2/3 rounded bg-neutral-700/50" />
      <div className="h-4 w-full rounded bg-neutral-700/50" />
      <div className="h-4 w-5/6 rounded bg-neutral-700/50" />
    </div>
  );
}


  return (
    <div className="space-y-4">
      {statusMessage && (
        <div className="rounded-xl border border-brand-blue-500/20 bg-brand-blue-500/10 px-4 py-3 text-sm text-brand-blue-300">
          {statusMessage}
        </div>
      )}
      

      {/* IZABERI DATUM */}
      <Panel className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
            Pregled rasporeda
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-[126px] rounded-xl border border-white/10 bg-neutral-950/60 px-2 py-2 text-xs text-white outline-none focus:border-brand-blue-500"
            />
            {filterDate && (
              <button
                onClick={() => setFilterDate("")}
                className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-medium text-neutral-200 transition hover:bg-white/10"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <DayPicker
          days={dayPickerDays}
          selectedKey={selectedDayKey}
          onSelect={setSelectedDayKey}
          metaByKey={dayMetaByKey}
        />
      </Panel>

      {/* NOVI TERMIN */}
      <Panel className="p-4">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
          Novi termin
        </p>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_96px_auto] items-end gap-2">
          <label className="min-w-0 text-xs font-medium text-neutral-300">
            Datum
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full min-w-0 rounded-xl border border-white/10 bg-neutral-950/60 px-2 py-2.5 text-xs text-white outline-none focus:border-brand-blue-500"
            />
          </label>
          <label className="min-w-0 text-xs font-medium text-neutral-300">
            Vreme
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1 block w-full min-w-0 rounded-xl border border-white/10 bg-neutral-950/60 px-2 py-2.5 text-xs text-white outline-none focus:border-brand-blue-500"
            />
          </label>
          <button
            onClick={createSlot}
            className="rounded-xl bg-brand-blue-500 px-3 py-2.5 text-xs font-semibold text-white shadow-glow transition hover:bg-brand-blue-600"
          >
            Kreiraj
          </button>
        </div>
      </Panel>

      {/* SLOTS */}
      <div className="space-y-3">
        {selectedDaySlots.length === 0 && (
          <Panel className="p-4 text-center text-sm text-neutral-400">
            Nema termina za izabrani dan.
          </Panel>
        )}

        {selectedDaySlots.map((slot) => {
          const bks = slotBookings(slot);
          const availability = getSlotAvailability(slot, countsByTimestamp);

          return (
            <div
              key={slot.id}
              className={`rounded-2xl border p-3 ${
                slot.locked
                  ? "border-red-400/25 bg-red-500/10"
                  : "border-white/10 bg-neutral-950/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    {slot.timestamp.toLocaleTimeString("sr-RS", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusPill tone={availability.available === 0 ? "red" : "neutral"}>
                      {availability.booked} / {availability.effectiveCapacity}
                    </StatusPill>
                    {availability.neighborLimited && (
                      <StatusPill tone="amber">Susedni termini</StatusPill>
                    )}
                    {availability.overCapacity && (
                      <StatusPill tone="red">Preko limita</StatusPill>
                    )}
                    {slot.locked && (
                      <StatusPill tone="red">Zaključano</StatusPill>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setBookingSlot(slot);
                      setClientSearch("");
                    }}
                    className="rounded-xl border border-brand-blue-500/25 bg-brand-blue-500/10 px-3 py-2 text-xs font-medium text-brand-blue-300 transition hover:bg-brand-blue-500/15"
                  >
                    Klijent
                  </button>

                  <button
                    onClick={() => toggleLock(slot)}
                    title={slot.locked ? "Otključaj termin" : "Zaključaj termin"}
                    aria-label={slot.locked ? "Otključaj termin" : "Zaključaj termin"}
                    className={`rounded-xl border p-2 ${
                      slot.locked
                        ? "border-red-400/30 bg-red-500/10 text-red-300"
                        : "border-brand-green-500/25 bg-brand-green-500/10 text-brand-green-300"
                    }`}
                  >
                    <LockIcon locked={slot.locked} />
                  </button>
                </div>
              </div>

              {bks.length === 0 && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs italic text-neutral-500">
                  Nema rezervacija
                </div>
              )}

              {bks.map((b) => {
                const u = users.find((user) => user.id === b.userId);
                const isPending = pendingBookingIds.includes(b.id);
                const hasActiveSub = u?.hasActiveSub !== false;

                return (
                  <div
                    key={b.id}
                    className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar
                        name={u ? `${u.name || ""} ${u.surname || ""}`.trim() : b.userId}
                        photoURL={u?.photoURL || ""}
                        className="h-8 w-8 text-xs"
                      />
                      {!hasActiveSub && (
                        <span
                          title="Nema aktivnu članarinu"
                          className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-400"
                        />
                      )}
                      <Link
                        to={`/profil/${b.userId}`}
                        className={`truncate font-medium ${
                          hasActiveSub ? "text-white" : "text-red-300"
                        }`}
                      >
                        {u ? `${u.name} ${u.surname}` : b.userId}
                      </Link>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      {!b.checkedIn ? (
                        <button
                          disabled={isPending}
                          onClick={() => handleCheckIn(b)}
                          className="rounded-lg border border-brand-green-500/25 bg-brand-green-500/10 px-2.5 py-1.5 text-xs font-medium text-brand-green-300 disabled:opacity-40"
                        >
                          Čekiraj
                        </button>
                      ) : (
                        <span className="text-green-500">✔︎</span>
                      )}
                      <button
                        disabled={isPending}
                        onClick={() => cancelBooking(b)}
                        className="rounded-lg border border-red-400/25 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-300 disabled:opacity-40"
                      >
                        Otkaži
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {bookingSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
          onClick={() => setBookingSlot(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-4 shadow-premium"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-white">
                Izaberi klijenta
              </p>
              <button
                onClick={() => setBookingSlot(null)}
                aria-label="Zatvori"
                title="Zatvori"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl leading-none text-neutral-400 transition hover:bg-white/10 hover:text-white"
              >
                ×
              </button>
            </div>

            <input
              autoFocus
              type="search"
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
              placeholder="Pretraži klijente"
              className="mb-3 w-full rounded-xl border border-white/10 bg-neutral-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500"
            />

            {getSlotAvailability(bookingSlot, countsByTimestamp).available === 0 && (
              <p className="mb-3 text-xs text-amber-300">
                Termin je popunjen. Rezervacija će biti dodata preko uobičajenog limita.
              </p>
            )}

            <div className="max-h-72 space-y-1 overflow-y-auto">
              {matchingUsers.map((user) => {
                const hasActiveSub = user.hasActiveSub !== false;

                return (
                  <button
                    key={user.id}
                    disabled={clientBookingPending}
                    onClick={() => selectClient(user.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-neutral-200 transition hover:bg-white/5 disabled:opacity-50"
                  >
                    <Avatar
                      name={`${user.name || ""} ${user.surname || ""}`.trim()}
                      photoURL={user.photoURL || ""}
                      className="h-9 w-9 text-xs"
                    />
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      {!hasActiveSub && (
                        <span
                          title="Nema aktivnu članarinu"
                          className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-400"
                        />
                      )}
                      <span className={`min-w-0 truncate ${hasActiveSub ? "" : "text-red-300"}`}>
                        {user.name} {user.surname}
                      </span>
                    </span>
                  </button>
                );
              })}

              {matchingUsers.length === 0 && (
                <p className="px-3 py-2 text-sm text-neutral-500">
                  Nema pronađenih klijenata.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
