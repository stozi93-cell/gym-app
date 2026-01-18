import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { startOfWeek, endOfWeek, isWithinInterval } from "date-fns";

const WINDOW_DAYS = 7;
const MAX_CAPACITY = 5;
const BOOKING_CUTOFF_HOURS = 1;

export default function Bookings() {
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingCounts, setBookingCounts] = useState({});
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  /* ---------------- helpers ---------------- */

  const toDate = (ts) => (ts instanceof Date ? ts : ts.toDate());

  function sameTimestamp(a, b) {
    return a.getTime() === b.getTime();
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
        });
      });
    }

    return out;
  }

  /* ---------------- data load ---------------- */

  async function loadData(dateOverride) {
    setLoading(true);

    const start = dateOverride ?? new Date();
    const end = new Date(start);
    end.setDate(start.getDate() + WINDOW_DAYS);

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
      ...d.data(),
      timestamp: d.data().timestamp.toDate(),
      generated: false,
    }));

    // generated slots
    const generatedSlots = generateSlotsFromTemplates(
      tplData,
      start,
      WINDOW_DAYS
    ).filter(
      (g) =>
        !realSlots.some((s) =>
          sameTimestamp(s.timestamp, g.timestamp)
        )
    );

    const allSlots = [...realSlots, ...generatedSlots].sort(
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

    setBookingCounts(counts);
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
    if (!canBook(slot.timestamp)) {
      alert("Rezervacija nije moguća manje od 1h pre početka treninga.");
      return;
    }

    let slotId = slot.id;

    if (slot.generated) {
      const ref = await addDoc(collection(db, "slots"), {
        timestamp: slot.timestamp,
        capacity: MAX_CAPACITY,
        createdFromTemplate: slot.templateId,
      });
      slotId = ref.id;
    }

    await addDoc(collection(db, "bookings"), {
      slotId,
      slotTimestamp: slot.timestamp,
      userId: auth.currentUser.uid,
      createdAt: new Date(),
    });

    loadData(selectedDate);
  }

  async function cancel(slotId) {
    const b = bookings.find((b) => b.slotId === slotId);
    if (!b) return;
    await deleteDoc(doc(db, "bookings", b.id));
    loadData(selectedDate);
  }

  if (loading) {
  return (
    <div className="space-y-4">
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
    .map((b) => slots.find((s) => s.id === b.slotId))
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
            bookings.some((b) => b.slotId === s.id)
          );
          const hasCheckedIn = daySlots.some((s) =>
            bookings.some(
              (b) => b.slotId === s.id && b.checkedIn
            )
          );
const userBookingForDay = bookings.find((b) =>
  daySlots.some((s) => s.id === b.slotId)
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
  (b) => b.slotId === slot.id
);

const booked = !!booking;
const checkedIn = booking?.checkedIn === true;

const hasBookingThatDay = !!userBookingForDay;
const isUsersSlotForDay =
  userBookingForDay?.slotId === slot.id;


                  const count = bookingCounts[slot.id] || 0;
                  const full = count >= MAX_CAPACITY;
                  const allowed = canBook(slot.timestamp);

                  return (
                    <div
  key={slot.id}
  className={`flex justify-between items-center rounded-lg px-3 py-1 transition-opacity ${
    !allowed && !booked && !full
      ? "bg-neutral-900 text-neutral-500"
      : "bg-neutral-800"
  } ${
    hasBookingThatDay && !isUsersSlotForDay
      ? "opacity-40 pointer-events-none"
      : ""
  }`}
>

                      <span className="text-sm">
                        {formatTime(slot.timestamp)} —{" "}
                        <span className="text-neutral-400">
                          {count}/{MAX_CAPACITY}
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
    onClick={() => cancel(slot.id)}
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

                      {!booked && !allowed && !full && (
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
