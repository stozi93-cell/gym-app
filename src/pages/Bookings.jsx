import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  bookSlot as createBooking,
  getBookingErrorMessage,
} from "../bookings/bookSlot";
import { Panel } from "../components/ui/Primitives";
import DayPicker, {
  buildDayPickerDays,
  makeDayKey,
} from "../components/ui/DayPicker";
import {
  getCapacity,
  countBookingsByTimestamp,
  getSlotAvailability,
} from "../../functions/bookings/capacity.mjs";

const WINDOW_DAYS = 7;
const BOOKING_CUTOFF_HOURS = 1;

export default function Bookings() {
  const [slots, setSlots] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedDate] = useState(null);
  const [selectedDayKey, setSelectedDayKey] = useState(() =>
    makeDayKey(new Date())
  );
  const refreshTimerRef = useRef(null);
  const loadRequestRef = useRef(0);
  const actionPendingRef = useRef(false);
  const [actionPending, setActionPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const bookings = useMemo(
    () => allBookings.filter((booking) => booking.userId === auth.currentUser?.uid),
    [allBookings]
  );
  const countsByTimestamp = useMemo(
    () => countBookingsByTimestamp(allBookings, slots),
    [allBookings, slots]
  );
  const availabilityBySlot = useMemo(
    () => Object.fromEntries(slots.map((slot) => [slot.id, getSlotAvailability(slot, countsByTimestamp)])),
    [slots, countsByTimestamp]
  );

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let initialSnapshotsRemaining = 2;

    const scheduleRefresh = () => {
      if (initialSnapshotsRemaining > 0) {
        initialSnapshotsRemaining -= 1;
        return;
      }

      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        loadData(selectedDate, true);
      }, 150);
    };

    const unsubBookings = onSnapshot(
      collection(db, "bookings"),
      (snapshot) => {
        setAllBookings(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setBookingsLoading(false);
      },
      () => {
        setBookingsLoading(true);
        setStatusMessage("Raspoloživost nije učitana. Proverite vezu i osvežite stranicu.");
      }
    );
    const unsubSlots = onSnapshot(
      collection(db, "slots"),
      scheduleRefresh
    );
    const unsubTemplates = onSnapshot(
      collection(db, "slotTemplates"),
      scheduleRefresh
    );

    return () => {
      clearTimeout(refreshTimerRef.current);
      unsubBookings();
      unsubSlots();
      unsubTemplates();
    };
  }, [selectedDate]);

  useEffect(() => {
    const visibleDays = buildDayPickerDays(selectedDate || new Date(), 6);
    if (
      visibleDays.length &&
      !visibleDays.some((day) => day.key === selectedDayKey)
    ) {
      setSelectedDayKey(visibleDays[0].key);
    }
  }, [selectedDate, selectedDayKey]);

  /* ---------------- helpers ---------------- */

  const toDate = (ts) => (ts instanceof Date ? ts : ts.toDate());

  function sameTimestamp(a, b) {
    return a.getTime() === b.getTime();
  }

  function hasSlotId(slot, slotId) {
    return (slot.slotIds || [slot.id]).includes(slotId);
  }

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
  locked: false,
});
      });
    }

    return out;
  }

  /* ---------------- data load ---------------- */

  async function loadData(dateOverride, background = false) {
    const requestId = ++loadRequestRef.current;
    if (!background) setLoading(true);
    try {

    const startDate = dateOverride ? new Date(dateOverride) : new Date();
startDate.setHours(0, 0, 0, 0);

const endDate = new Date(startDate);
endDate.setDate(startDate.getDate() + WINDOW_DAYS);

const start = Timestamp.fromDate(startDate);
const end = Timestamp.fromDate(endDate);

    // templates
    const tplSnap = await getDocs(collection(db, "slotTemplates"));
    const tplData = tplSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    // real slots
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
  locked: d.data().locked === true,
  ...d.data(),
  capacity: getCapacity(d.data().capacity),
  timestamp: d.data().timestamp.toDate(),
  generated: false,
}));

    // generated slots
    const templateSlots = generateSlotsFromTemplates(
  tplData,
  startDate,
  WINDOW_DAYS
);

    const mergedRealSlots = [];

    realSlots.forEach((slot) => {
      const existing = mergedRealSlots.find((candidate) =>
        sameTimestamp(candidate.timestamp, slot.timestamp)
      );

      if (existing) {
        existing.slotIds.push(slot.id);
        existing.locked ||= slot.locked;
        return;
      }

      const templateSlot = templateSlots.find((template) =>
        sameTimestamp(template.timestamp, slot.timestamp)
      );

      mergedRealSlots.push({
        ...slot,
        capacity: templateSlot?.capacity ?? slot.capacity,
        slotIds: [slot.id],
      });
    });

    const generatedSlots = templateSlots.filter((template) =>
      !realSlots.some((slot) =>
        sameTimestamp(slot.timestamp, template.timestamp)
      )
    );

    const allSlots = [...mergedRealSlots, ...generatedSlots].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    if (requestId === loadRequestRef.current) setSlots(allSlots);
    } catch {
      if (requestId === loadRequestRef.current) {
        setStatusMessage("Raspored nije učitan. Proverite vezu i osvežite stranicu.");
      }
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }

  /* ---------------- booking ---------------- */

  function canBook(ts) {
    return (
      (ts.getTime() - Date.now()) /
        (1000 * 60 * 60) >=
      BOOKING_CUTOFF_HOURS
    );
  }

  async function book(slot) {
    if (actionPendingRef.current || bookingsLoading) return;
    if (slot.locked) {
  alert("Ovaj termin je zaključan.");
  return;
}

    if (!canBook(slot.timestamp)) {
      alert("Rezervacija nije moguća manje od 1h pre početka treninga.");
      return;
    }

    if (availabilityBySlot[slot.id]?.available === 0) {
      alert("Termin je popunjen.");
      return;
    }

    actionPendingRef.current = true;
    setActionPending(true);
    try {
      await createBooking({ slot });
      setStatusMessage("Rezervacija je sačuvana.");
    } catch (error) {
      const message = getBookingErrorMessage(error);
      setStatusMessage(message);
      alert(message);
    } finally {
      actionPendingRef.current = false;
      setActionPending(false);
    }
  }

  async function cancel(slotId) {
    if (actionPendingRef.current) return;
    const b = bookings.find((b) => b.slotId === slotId);
    if (!b) return;
    actionPendingRef.current = true;
    setActionPending(true);
    try {
      await deleteDoc(doc(db, "bookings", b.id));
      setStatusMessage("Rezervacija je otkazana.");
    } catch {
      setStatusMessage("Rezervacija nije otkazana. Pokušajte ponovo.");
    } finally {
      actionPendingRef.current = false;
      setActionPending(false);
    }
  }

  if (loading) {
  return (
    <div className="space-y-4">
      {statusMessage && (
        <div className="rounded-xl border border-brand-blue-500/20 bg-brand-blue-500/10 px-4 py-3 text-sm text-brand-blue-300">
          {statusMessage}
        </div>
      )}
      <div className="h-4 w-2/3 rounded bg-neutral-700/50" />
      <div className="h-4 w-full rounded bg-neutral-700/50" />
      <div className="h-4 w-5/6 rounded bg-neutral-700/50" />
    </div>
  );
}


  /* ---------------- formatting ---------------- */

  const formatTime = (d) =>
    toDate(d).toLocaleTimeString("sr-Latn-RS", {
      hour: "2-digit",
      minute: "2-digit",
    });

  /* ---------------- derived data ---------------- */

  const groupedSlots = slots.reduce((acc, slot) => {
    const key = makeDayKey(slot.timestamp);
    (acc[key] ||= []).push(slot);
    return acc;
  }, {});

  const dayPickerDays = buildDayPickerDays(selectedDate || new Date(), 6);
  const todayKey = makeDayKey(new Date());
  const dayMetaByKey = dayPickerDays.reduce((acc, day) => {
    const daySlots = groupedSlots[day.key] || [];
    const hasUserBooking = daySlots.some((slot) =>
      bookings.some((booking) => hasSlotId(slot, booking.slotId))
    );
    const hasCheckedIn = daySlots.some((slot) =>
      bookings.some(
        (booking) => hasSlotId(slot, booking.slotId) && booking.checkedIn
      )
    );

    acc[day.key] = {
      today: day.key === todayKey,
      label: hasCheckedIn || hasUserBooking || daySlots.length > 0,
      tone: hasCheckedIn ? "green" : hasUserBooking ? "blue" : "neutral",
    };
    return acc;
  }, {});

  const selectedDaySlots = [...(groupedSlots[selectedDayKey] || [])].sort(
    (a, b) => a.timestamp - b.timestamp
  );
  const userBookingForDay = bookings.find((booking) =>
    selectedDaySlots.some((slot) => hasSlotId(slot, booking.slotId))
  );
  const visibleSelectedDaySlots = selectedDaySlots.filter((slot) => {
    const booking = bookings.find((item) => hasSlotId(slot, item.slotId));
    return !!booking || canBook(slot.timestamp);
  });
  const morningSlots = visibleSelectedDaySlots.filter(
    (slot) => slot.timestamp.getHours() * 60 + slot.timestamp.getMinutes() < 15 * 60 + 30
  );
  const afternoonSlots = visibleSelectedDaySlots.filter(
    (slot) => slot.timestamp.getHours() * 60 + slot.timestamp.getMinutes() >= 15 * 60 + 30
  );

  /* ---------------- JSX ---------------- */

  return (
    <div className="space-y-4">
      {statusMessage && (
        <div className="rounded-xl border border-brand-blue-500/20 bg-brand-blue-500/10 px-4 py-3 text-sm text-brand-blue-300">
          {statusMessage}
        </div>
      )}
      {/* Slots */}
      <Panel className="p-3">
        <DayPicker
          days={dayPickerDays}
          selectedKey={selectedDayKey}
          onSelect={setSelectedDayKey}
          metaByKey={dayMetaByKey}
        />
      </Panel>

      <div className="space-y-4">
        {visibleSelectedDaySlots.length === 0 && (
          <Panel className="p-4 text-center text-sm text-neutral-400">
            Nema termina za izabrani dan.
          </Panel>
        )}

        {visibleSelectedDaySlots.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <SlotColumn
              title="Prepodne"
              slots={morningSlots}
              bookings={bookings}
              availabilityBySlot={availabilityBySlot}
              actionPending={actionPending || bookingsLoading}
              userBookingForDay={userBookingForDay}
              hasSlotId={hasSlotId}
              formatTime={formatTime}
              book={book}
              cancel={cancel}
              canBook={canBook}
            />

            <SlotColumn
              title="Popodne"
              slots={afternoonSlots}
              bookings={bookings}
              availabilityBySlot={availabilityBySlot}
              actionPending={actionPending || bookingsLoading}
              userBookingForDay={userBookingForDay}
              hasSlotId={hasSlotId}
              formatTime={formatTime}
              book={book}
              cancel={cancel}
              canBook={canBook}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SlotColumn({
  title,
  slots,
  bookings,
  availabilityBySlot,
  actionPending,
  userBookingForDay,
  hasSlotId,
  formatTime,
  book,
  cancel,
  canBook,
}) {
  return (
    <section className="min-w-0 space-y-2">
      <p className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
        {title}
      </p>
      <div className="space-y-2">
        {slots.map((slot) => (
          <SlotCard
            key={slot.id}
            slot={slot}
            bookings={bookings}
            availabilityBySlot={availabilityBySlot}
            actionPending={actionPending}
            userBookingForDay={userBookingForDay}
            hasSlotId={hasSlotId}
            formatTime={formatTime}
            book={book}
            cancel={cancel}
            canBook={canBook}
          />
        ))}
        {!slots.length && (
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-center text-xs text-neutral-500">
            Nema
          </div>
        )}
      </div>
    </section>
  );
}

function SlotCard({
  slot,
  bookings,
  availabilityBySlot,
  actionPending,
  userBookingForDay,
  hasSlotId,
  formatTime,
  book,
  cancel,
  canBook,
}) {
  const booking = bookings.find((item) => hasSlotId(slot, item.slotId));
  const booked = !!booking;
  const checkedIn = booking?.checkedIn === true;
  const hasBookingThatDay = !!userBookingForDay;
  const isUsersSlotForDay = hasSlotId(slot, userBookingForDay?.slotId);
  const available = availabilityBySlot[slot.id]?.available || 0;
  const full = available === 0;
  const allowed = !booked && !slot.locked && canBook(slot.timestamp);
  const disabledByOtherBooking = hasBookingThatDay && !isUsersSlotForDay && !booked;

  return (
    <div
      className={`min-h-[76px] rounded-xl border px-2.5 py-2 transition-opacity ${
        slot.locked
          ? "border-red-400/20 bg-red-500/10 text-neutral-500 opacity-70"
          : "border-white/10 bg-neutral-950/60"
      } ${disabledByOtherBooking ? "pointer-events-none opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-tight text-white">
          {formatTime(slot.timestamp)}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-neutral-300">
          Slobodno: {available}
        </span>
      </div>

      <div className="mt-2">
        {!booked && !full && allowed && !hasBookingThatDay && (
          <button
            disabled={actionPending}
            className="w-full rounded-lg border border-brand-green-500/25 bg-brand-green-500/10 px-2 py-1.5 text-xs font-semibold text-brand-green-300 transition hover:bg-brand-green-500/15 disabled:opacity-50"
            onClick={() => book(slot)}
          >
            Rezerviši
          </button>
        )}

        {booked && !checkedIn && (
          <button
            disabled={actionPending}
            className="w-full rounded-lg border border-red-400/25 bg-red-500/10 px-2 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
            onClick={() => cancel(booking.slotId)}
          >
            Otkaži
          </button>
        )}

        {checkedIn && (
          <span className="inline-flex w-full items-center justify-center rounded-lg border border-brand-green-500/25 bg-brand-green-500/10 px-2 py-1.5 text-xs font-medium text-brand-green-300">
            Odrađen
          </span>
        )}

        {!booked && full && (
          <span className="inline-flex w-full items-center justify-center rounded-lg border border-red-400/25 bg-red-500/10 px-2 py-1.5 text-xs font-medium text-red-300">
            Popunjeno
          </span>
        )}

        {slot.locked && (
          <span className="inline-flex w-full items-center justify-center rounded-lg border border-red-400/25 bg-red-500/10 px-2 py-1.5 text-xs font-medium text-red-300">
            Zaključano
          </span>
        )}

        {disabledByOtherBooking && (
          <span className="inline-flex w-full items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-medium text-neutral-400">
            Jedan dnevno
          </span>
        )}
      </div>
    </div>
  );
}
