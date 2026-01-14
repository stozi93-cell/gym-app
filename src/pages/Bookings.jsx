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
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [openHeader, setOpenHeader] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  async function loadData() {
    setLoading(true);

    const now = new Date();
    const endDate = new Date();
    endDate.setDate(now.getDate() + WINDOW_DAYS);

    const slotSnap = await getDocs(
      query(
        collection(db, "slots"),
        where("timestamp", ">=", now),
        where("timestamp", "<=", endDate),
        orderBy("timestamp")
      )
    );

    const slotData = slotSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    setSlots(slotData);

    const slotIds = slotData.map((s) => s.id);

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

    const counts = {};
    if (slotIds.length > 0) {
      const CHUNK_SIZE = 10;
      for (let i = 0; i < slotIds.length; i += CHUNK_SIZE) {
        const chunk = slotIds.slice(i, i + CHUNK_SIZE);
        const snap = await getDocs(
          query(collection(db, "bookings"), where("slotId", "in", chunk))
        );
        snap.docs.forEach((b) => {
          const sid = b.data().slotId;
          counts[sid] = (counts[sid] || 0) + 1;
        });
      }
    }

    setBookingCounts(counts);
    setLoading(false);
  }

  function canBook(slotTimestamp) {
    const slotTime = slotTimestamp.toDate();
    const diffHours =
      (slotTime.getTime() - new Date().getTime()) /
      (1000 * 60 * 60);
    return diffHours >= BOOKING_CUTOFF_HOURS;
  }

  async function book(slotId, slotTimestamp) {

    if (!canBook(slotTimestamp)) {
      alert("Rezervacija nije moguća manje od 1h pre početka treninga.");
      return;
    }
    if (bookings.some((b) => b.slotId === slotId)) {
      alert("Već ste rezervisali ovaj trening.");
      return;
    }
    const count = bookingCounts[slotId] || 0;
    if (count >= MAX_CAPACITY) {
      alert("Trening je popunjen.");
      return;
    }

    await addDoc(collection(db, "bookings"), {
      slotId,
      userId: auth.currentUser.uid,
      createdAt: new Date(),
    });

    loadData();
  }

  async function cancel(slotId) {
    const b = bookings.find((b) => b.slotId === slotId);
    if (!b) return;
    await deleteDoc(doc(db, "bookings", b.id));
    loadData();
  }

  if (loading) return <p className="text-neutral-400">Učitavanje...</p>;

  function formatDate(d, opts) {
    return d.toLocaleDateString("sr-Latn-RS", opts);
  }

  function formatTime(d) {
    return d.toLocaleTimeString("sr-Latn-RS", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function formatCountdown(date) {
    const diff = date - now;
    if (diff <= 0) return null;

    const totalMin = Math.floor(diff / 60000);
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;

    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `Počinje za ${m} min`;
  }

  const today = new Date();

  const weeklyDone = bookings.filter((b) => {
    if (!b.checkedIn) return false;
    const slot = slots.find((s) => s.id === b.slotId);
    if (!slot) return false;
    const d = slot.timestamp.toDate();
    return isWithinInterval(d, {
      start: startOfWeek(today, { weekStartsOn: 1 }),
      end: endOfWeek(today, { weekStartsOn: 1 }),
    });
  });

  const pastVisits = weeklyDone
    .map((b) => {
      const slot = slots.find((s) => s.id === b.slotId);
      return slot ? slot.timestamp.toDate() : null;
    })
    .filter(Boolean)
    .sort((a, b) => b - a);

  const futureBookings = bookings
    .map((b) => slots.find((s) => s.id === b.slotId))
    .filter((s) => s && s.timestamp.toDate() >= today)
    .sort((a, b) => a.timestamp.toDate() - b.timestamp.toDate());

  const nextTraining = futureBookings[0];
  const additionalBookings = futureBookings.slice(1);
  const countdown = nextTraining
    ? formatCountdown(nextTraining.timestamp.toDate())
    : null;

  const groupedSlots = slots.reduce((acc, slot) => {
    const key = capitalize(
      formatDate(slot.timestamp.toDate(), {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    );
    acc[key] = acc[key] || [];
    acc[key].push(slot);
    return acc;
  }, {});

  const sortedDates = Object.entries(groupedSlots).sort(
    (a, b) =>
      a[1][0].timestamp.toDate() -
      b[1][0].timestamp.toDate()
  );

  return (
    <div className="space-y-4">
      {/* Sledeći trening */}
      <div className="bg-neutral-800 ring-1 ring-green-700 rounded-xl p-4">
        <button
          onClick={() => setOpenHeader(!openHeader)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <div className="text-sm text-neutral-400">
              Sledeći trening
            </div>

            {nextTraining ? (
              <>
                <div className="text-2xl font-semibold">
                  {formatTime(
                    nextTraining.timestamp.toDate()
                  )}
                </div>
                <div className="text-sm text-neutral-400">
                  {capitalize(
                    formatDate(
                      nextTraining.timestamp.toDate(),
                      {
                        weekday: "long",
                        day: "2-digit",
                        month: "long",
                      }
                    )
                  )}
                </div>
              </>
            ) : (
              <div className="text-sm text-neutral-400 mt-1">
                Nemate zakazanih treninga.
              </div>
            )}
          </div>

          <div className="flex items-center gap-7">
            <span
              className={`text-neutral-400 text-2xl transition-transform ${
                openHeader ? "rotate-180" : ""
              }`}
            >
              ⌄
            </span>
          </div>
        </button>

        {openHeader && (
          <div className="mt-4 space-y-4">
            {additionalBookings.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">
                  Dodatne rezervacije
                </div>
                <ul className="text-sm text-blue-400 space-y-1">
                  {additionalBookings.map((s) => (
                    <li key={s.id}>
                      {formatTime(
                        s.timestamp.toDate()
                      )}{" "}
                      —{" "}
                      {capitalize(
                        formatDate(
                          s.timestamp.toDate(),
                          {
                            weekday: "long",
                            day: "2-digit",
                            month: "long",
                          }
                        )
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="text-sm font-medium mb-1">
                Odrađeni treninzi ove nedelje:
              </div>

              {pastVisits.length > 0 && (
                <ul className="text-sm text-green-500 space-y-1">
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
        )}
      </div>

      {/* Slots */}
      
      <div className="space-y-2">
        {sortedDates.map(([date, daySlots]) => (
          <details
            key={date}
            className="bg-neutral-900 border-l-4 border-neutral-600 pl-2 rounded-xl p-3"
          >
            <summary className="font-medium cursor-pointer pl-1">
               {date}
            </summary>

            <div className="mt-2 space-y-2">
              {daySlots.map((slot) => {
                const booked = bookings.some(
                  (b) => b.slotId === slot.id
                );
                const count =
                  bookingCounts[slot.id] || 0;
                const full = count >= MAX_CAPACITY;
                const allowed = canBook(slot.timestamp);

                return (
                  <div
                    key={slot.id}
                    className="flex justify-between items-center bg-neutral-800 rounded-lg px-3 py-2"
                  >
                    <span className="text-sm">
                      {formatTime(
                        slot.timestamp.toDate()
                      )}{" "}
                      —{" "}
                      <span className="text-neutral-400">
                        {count}/{MAX_CAPACITY}
                      </span>
                    </span>

                    {!booked &&
                      !full &&
                      allowed && (
                        <button
                          className="text-sm text-green-400"
                          onClick={() =>
                            book(
                              slot.id,
                              slot.timestamp
                            )
                          }
                        >
                          Rezerviši
                        </button>
                      )}

                    {booked && (
                      <button
                        className="text-sm text-red-400"
                        onClick={() =>
                          cancel(slot.id)
                        }
                      >
                        Otkaži
                      </button>
                    )}

                    {!booked && full && (
                      <span className="text-xs text-red-400">
                        Popunjeno
                      </span>
                    )}

                    {!booked &&
                      !allowed &&
                      !full && (
                        <span className="text-xs text-amber-400">
                          Zatvoreno
                        </span>
                      )}
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
