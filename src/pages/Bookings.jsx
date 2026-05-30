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

    const startDate = dateOverride ?? new Date();
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
        <div className="rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-200">
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
    const key = capitalize(
      formatDate(slot.timestamp, {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    );
    (acc[key] ||= []).push(slot);
    return acc;
  }, {});

  const sortedDates = Object.entries(groupedSlots).sort(
    (a, b) => a[1][0].timestamp - b[1][0].timestamp
  );

  /* ---------------- JSX ---------------- */

  return (
    <div className="space-y-4">
      {/* Sledeći trening */}
      <div className="bg-neutral-800 ring-1 ring-neutral-700 rounded-xl px-4 py-3 space-y-3">
        <div>
          <div className="text-xs text-neutral-400">
            Sledeći trening
          </div>

          {nextTraining ? (
            <>
              <div className="text-2xl font-semibold leading-tight">
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
            <div className="text-sm text-red-400 mt-1">
              Nemate zakazanih treninga.
            </div>
          )}
        </div>
        <div className="border-t border-neutral-600" />


        {additionalBookings.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-0.5 text-neutral-300">
              Ostale rezervacije:
            </div>
            <ul className="text-xs text-blue-400 space-y-0.5">
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

        <div className="border-t border-neutral-700/50 my-2" />

        <div>
          <div className="text-xs font-medium mb-0.5 text-neutral-300">
            Odrađeni treninzi:
          </div>

          {pastVisits.length > 0 && (
            <ul className="text-xs text-green-500 space-y-0.5">
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
      </div>

      {/* Slots */}
      <div className="space-y-2">
        {sortedDates.map(([date, daySlots]) => {
          const hasUserBooking = daySlots.some((s) =>
            bookings.some((b) => hasSlotId(s, b.slotId))
          );
          const hasCheckedIn = daySlots.some((s) =>
            bookings.some(
              (b) => hasSlotId(s, b.slotId) && b.checkedIn
            )
          );
const userBookingForDay = bookings.find((b) =>
  daySlots.some((s) => hasSlotId(s, b.slotId))
);

          return (
            <details
              key={date}
              className={`bg-neutral-900 border-l-4 pl-2 rounded-xl px-3 py-2.5 ${
                hasCheckedIn
                  ? "border-green-500"
                  : hasUserBooking
                  ? "border-blue-500"
                  : "border-neutral-600"
              }`}
            >
              <summary className="font-medium cursor-pointer text-sm pl-1">
               {date}
              </summary>

              <div className="mt-2 space-y-2">
                {daySlots.map((slot) => {
                  const booking = bookings.find(
  (b) => hasSlotId(slot, b.slotId)
);

const booked = !!booking;
const checkedIn = booking?.checkedIn === true;

const hasBookingThatDay = !!userBookingForDay;
const isUsersSlotForDay =
  hasSlotId(slot, userBookingForDay?.slotId);


                  const count = bookingCounts[slot.id] || 0;
                  const full = count >= slot.capacity;
                  const allowed =
  !booked &&
  !slot.locked &&
  canBook(slot.timestamp);

                  return (
                    <div
  key={slot.id}
  className={`flex justify-between items-center rounded-lg px-3 py-1 transition-opacity ${
    slot.locked
  ? "bg-neutral-900 text-neutral-500 opacity-60"
  : !allowed && !booked && !full
  ? "bg-neutral-900 text-neutral-500"
  : "bg-neutral-800"
  } ${
  hasBookingThatDay &&
  !isUsersSlotForDay &&
  !booked
    ? "opacity-40 pointer-events-none"
    : ""
}`}
>

                      <span className="text-sm">
                        {formatTime(slot.timestamp)} —{" "}
                        <span className="text-neutral-400">
                          {count}/{slot.capacity}
                        </span>
                      </span>

                      {!booked &&
  !full &&
  allowed &&
  !hasBookingThatDay && (

                        <button
                          className="text-sm text-green-400"
                          onClick={() => book(slot)}
                        >
                          Rezerviši
                        </button>
                      )}

                      {/* Booked but NOT checked in */}
{booked && !checkedIn && (
  <button
    className="text-sm text-red-400"
    onClick={() => cancel(booking.slotId)}
  >
    Otkaži
  </button>
)}

{/* Checked in */}
{checkedIn && (
  <span className="text-xs text-green-500 font-medium">
    Trening odrađen
  </span>
)}

                      {!booked && full && (
                        <span className="text-xs text-red-400">
                          Popunjeno
                        </span>
                      )}

                      {slot.locked && (
  <span className="text-xs text-red-400">
    Zaključano
  </span>
)}

{!slot.locked && !booked && !allowed && !full && (
  <span className="text-xs text-neutral-500">
    Zatvoreno
  </span>
)}
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
