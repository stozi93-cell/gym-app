import { useEffect, useRef, useState } from "react";
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
import { startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { Panel, StatusPill } from "../components/ui/Primitives";
import DayPicker, {
  buildDayPickerDays,
  makeDayKey,
} from "../components/ui/DayPicker";

const WINDOW_DAYS = 7;
const DEFAULT_CAPACITY = 5;
const BOOKING_CUTOFF_HOURS = 1;

function getCapacity(value) {
  const capacity = Number(value);
  return Number.isFinite(capacity) && capacity > 0
    ? capacity
    : DEFAULT_CAPACITY;
}

export default function Bookings() {
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingCounts, setBookingCounts] = useState({});
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDayKey, setSelectedDayKey] = useState(() =>
    makeDayKey(new Date())
  );
  const refreshTimerRef = useRef(null);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let initialSnapshotsRemaining = 3;

    const scheduleRefresh = () => {
      if (initialSnapshotsRemaining > 0) {
        initialSnapshotsRemaining -= 1;
        return;
      }

      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        loadData(selectedDate);
      }, 150);
    };

    const unsubBookings = onSnapshot(
      collection(db, "bookings"),
      scheduleRefresh
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

  async function loadData(dateOverride) {
    setLoading(true);

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
    setTemplates(tplData);

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

    setSlots(allSlots);

    // bookings
    const bookingSnap = await getDocs(
      query(
        collection(db, "bookings"),
        where("userId", "==", auth.currentUser.uid)
      )
    );

    const userBookings = bookingSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    setBookings(userBookings);

    // counts (real slots only)
    const counts = {};
    const realSlotIds = realSlots.map((s) => s.id);

    if (realSlotIds.length) {
      const CHUNK = 10;
      for (let i = 0; i < realSlotIds.length; i += CHUNK) {
        const snap = await getDocs(
          query(
            collection(db, "bookings"),
            where("slotId", "in", realSlotIds.slice(i, i + CHUNK))
          )
        );
        snap.docs.forEach((b) => {
          const id = b.data().slotId;
          counts[id] = (counts[id] || 0) + 1;
        });
      }
    }

    const displayedCounts = {};
    allSlots.forEach((slot) => {
      displayedCounts[slot.id] = (slot.slotIds || [slot.id]).reduce(
        (sum, slotId) => sum + (counts[slotId] || 0),
        0
      );
    });

    setBookingCounts(displayedCounts);
    setLoading(false);
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
    if (slot.locked) {
  alert("Ovaj termin je zaključan.");
  return;
}

    if (!canBook(slot.timestamp)) {
      alert("Rezervacija nije moguća manje od 1h pre početka treninga.");
      return;
    }

    if ((bookingCounts[slot.id] || 0) >= slot.capacity) {
      alert("Termin je popunjen.");
      return;
    }

    try {
      await createBooking({ slot });
      setStatusMessage("Rezervacija je sacuvana.");
      loadData(selectedDate);
    } catch (error) {
      const message = getBookingErrorMessage(error);
      setStatusMessage(message);
      alert(message);
    }
  }

  async function cancel(slotId) {
    const b = bookings.find((b) => b.slotId === slotId);
    if (!b) return;
    await deleteDoc(doc(db, "bookings", b.id));
    setStatusMessage("Rezervacija je otkazana.");
    loadData(selectedDate);
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

  const formatDate = (d, o) =>
    toDate(d).toLocaleDateString("sr-Latn-RS", o);

  const formatTime = (d) =>
    toDate(d).toLocaleTimeString("sr-Latn-RS", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------------- derived data ---------------- */

  const today = new Date();

  const weeklyDone = bookings.filter((b) => {
  if (!b.checkedIn) return false;
  if (!b.slotTimestamp) return false;

  const d = b.slotTimestamp.toDate();

  return isWithinInterval(d, {
    start: startOfWeek(today, { weekStartsOn: 1 }),
    end: endOfWeek(today, { weekStartsOn: 1 }),
  });
});


  const pastVisits = weeklyDone
  .map((b) => b.slotTimestamp.toDate())
  .sort((a, b) => b - a);

  const futureBookings = bookings
    .map((b) => slots.find((s) => hasSlotId(s, b.slotId)))
    .filter((s) => s && s.timestamp >= today)
    .sort((a, b) => a.timestamp - b.timestamp);

  const nextTraining = futureBookings[0];
  const additionalBookings = futureBookings.slice(1);

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
    (slot) => slot.timestamp.getHours() < 16
  );
  const afternoonSlots = visibleSelectedDaySlots.filter(
    (slot) => slot.timestamp.getHours() >= 16
  );

  /* ---------------- JSX ---------------- */

  return (
    <div className="space-y-4">
      {statusMessage && (
        <div className="rounded-xl border border-brand-blue-500/20 bg-brand-blue-500/10 px-4 py-3 text-sm text-brand-blue-300">
          {statusMessage}
        </div>
      )}
      {/* Sledeći trening */}
      <Panel className="p-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
            Sledeći trening
          </div>

          {nextTraining ? (
            <>
              <div className="mt-1 text-3xl font-semibold leading-tight text-white">
                {formatTime(nextTraining.timestamp)}
              </div>
              <div className="text-xs text-neutral-400">
                {capitalize(
                  formatDate(nextTraining.timestamp, {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                  })
                )}
              </div>
            </>
          ) : (
            <div className="mt-2 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              Nemate zakazanih treninga.
            </div>
          )}
        </div>
        <div className="border-t border-white/10" />


        {additionalBookings.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-0.5 text-neutral-300">
              Ostale rezervacije:
            </div>
            <ul className="space-y-1 text-xs text-brand-blue-300">
              {additionalBookings.map((s) => (
                <li key={s.id}>
                  {formatTime(s.timestamp)} —{" "}
                  {capitalize(
                    formatDate(s.timestamp, {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                    })
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="my-2 border-t border-white/10" />

        <div>
          <div className="text-xs font-medium mb-0.5 text-neutral-300">
            Odrađeni treninzi:
          </div>

          {pastVisits.length > 0 && (
            <ul className="space-y-1 text-xs text-brand-green-300">
              {pastVisits.map((d, i) => (
                <li key={i}>
                  {formatTime(d)} —{" "}
                  {capitalize(
                    formatDate(d, {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                    })
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

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
              bookingCounts={bookingCounts}
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
              bookingCounts={bookingCounts}
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
  bookingCounts,
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
            bookingCounts={bookingCounts}
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
  bookingCounts,
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
  const count = bookingCounts[slot.id] || 0;
  const full = count >= slot.capacity;
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
          {count}/{slot.capacity}
        </span>
      </div>

      <div className="mt-2">
        {!booked && !full && allowed && !hasBookingThatDay && (
          <button
            className="w-full rounded-lg border border-brand-green-500/25 bg-brand-green-500/10 px-2 py-1.5 text-xs font-semibold text-brand-green-300 transition hover:bg-brand-green-500/15"
            onClick={() => book(slot)}
          >
            Rezerviši
          </button>
        )}

        {booked && !checkedIn && (
          <button
            className="w-full rounded-lg border border-red-400/25 bg-red-500/10 px-2 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/15"
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
