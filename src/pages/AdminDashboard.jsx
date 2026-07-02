import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useUnreadCount } from "../chat/useUnreadCount";
import { Logo } from "../components/Logo";
import { Panel, StatusPill } from "../components/ui/Primitives";

function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function daysUntil(value) {
  const date = toDate(value);
  if (!date) return null;
  return Math.ceil((startOfDay(date) - startOfDay(new Date())) / 86400000);
}

function formatTime(value) {
  const date = toDate(value);
  if (!date) return "-";

  return date.toLocaleTimeString("sr-Latn-RS", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value) {
  return `${Math.round(value || 0).toLocaleString("sr-Latn-RS")} RSD`;
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const unread = useUnreadCount();
  const [users, setUsers] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [billing, setBilling] = useState([]);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      setUsers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
    const unsubMemberships = onSnapshot(
      collection(db, "clientSubscriptions"),
      (snapshot) => {
        setMemberships(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      }
    );
    const unsubBookings = onSnapshot(collection(db, "bookings"), (snapshot) => {
      setBookings(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
    const unsubBilling = onSnapshot(collection(db, "billing"), (snapshot) => {
      setBilling(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    return () => {
      unsubUsers();
      unsubMemberships();
      unsubBookings();
      unsubBilling();
    };
  }, []);

  const clients = useMemo(
    () => users.filter((user) => user.role === "client" && user.active !== false),
    [users]
  );

  const userById = useMemo(
    () => Object.fromEntries(users.map((user) => [user.id, user])),
    [users]
  );

  const activeMemberships = useMemo(() => {
    const today = startOfDay(new Date());
    return memberships.filter((membership) => {
      const end = toDate(membership.endDate);
      return membership.active !== false && end && end >= today;
    });
  }, [memberships]);

  const activeClientIds = useMemo(
    () => new Set(activeMemberships.map((membership) => membership.userId)),
    [activeMemberships]
  );

  const expiringCount = activeMemberships.filter((membership) => {
    const left = daysUntil(membership.endDate);
    return left !== null && left >= 0 && left <= 7;
  }).length;

  const unpaidTotal = billing.reduce((sum, invoice) => {
    if (invoice.status === "paid" || invoice.status === "cancelled") return sum;
    return sum + Math.max(0, (invoice.amount || 0) - (invoice.paidAmount || 0));
  }, 0);

  const todayBookings = useMemo(() => {
    const start = startOfDay(new Date());
    const end = endOfDay(new Date());

    return bookings
      .filter((booking) => {
        const date = toDate(booking.slotTimestamp);
        return date && date >= start && date <= end;
      })
      .sort((a, b) => toDate(a.slotTimestamp) - toDate(b.slotTimestamp));
  }, [bookings]);

  const checkedToday = todayBookings.filter((booking) => booking.checkedIn).length;
  const displayName = [profile?.name, profile?.surname].filter(Boolean).join(" ");

  return (
    <div className="space-y-4">
      <Panel className="overflow-hidden p-5">
        <Logo variant="full" className="h-16 w-auto max-w-[230px]" />
        <p className="mt-4 text-sm text-neutral-400">Admin pregled</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">
          {displayName || "ReMotion"}
        </h1>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Metric label="Danas" value={`${todayBookings.length} termina`} />
          <Metric label="Čekirano" value={`${checkedToday}/${todayBookings.length}`} />
          <Metric label="Aktivni" value={`${activeClientIds.size}/${clients.length}`} />
          <Metric label="Preostalo" value={formatMoney(unpaidTotal)} />
        </div>
      </Panel>

      <div className="grid grid-cols-3 gap-2">
        <SignalCard tone="blue" label="Poruke" value={unread || 0} to="/poruke" />
        <SignalCard tone="amber" label="Pred istekom" value={expiringCount} to="/klijenti" />
        <SignalCard tone="red" label="Bez članarine" value={clients.length - activeClientIds.size} to="/klijenti" />
      </div>

      <Panel className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
            Današnji raspored
          </p>
          <Link to="/raspored" className="text-xs font-medium text-brand-blue-300">
            Otvori
          </Link>
        </div>

        <div className="space-y-2">
          {todayBookings.slice(0, 4).map((booking) => {
            const client = userById[booking.userId];
            const hasActiveMembership = activeClientIds.has(booking.userId);

            return (
              <div
                key={booking.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {formatTime(booking.slotTimestamp)}
                  </p>
                  <p className={`truncate text-xs ${hasActiveMembership ? "text-neutral-400" : "text-red-300"}`}>
                    {client ? `${client.name || ""} ${client.surname || ""}`.trim() : booking.userId}
                  </p>
                </div>
                <StatusPill tone={booking.checkedIn ? "green" : "neutral"}>
                  {booking.checkedIn ? "Čekiran" : "Čeka"}
                </StatusPill>
              </div>
            );
          })}

          {todayBookings.length === 0 && (
            <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-neutral-400">
              Nema rezervacija za danas.
            </p>
          )}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3">
        <QuickLink to="/raspored" label="Raspored" />
        <QuickLink to="/klijenti" label="Klijenti" />
        <QuickLink to="/treninzi" label="Treninzi" />
        <QuickLink to="/naplate" label="Naplate" />
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function SignalCard({ label, value, tone, to }) {
  const styles = {
    blue: "border-brand-blue-500/25 bg-brand-blue-500/10 text-brand-blue-300",
    amber: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    red: "border-red-400/25 bg-red-500/10 text-red-300",
  };

  return (
    <Link to={to} className={`rounded-2xl border p-3 text-center ${styles[tone]}`}>
      <p className="text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em]">
        {label}
      </p>
    </Link>
  );
}

function QuickLink({ to, label }) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-white/10 bg-neutral-900/80 p-4 text-sm font-semibold text-white transition hover:bg-neutral-900"
    >
      {label}
    </Link>
  );
}
