import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useUnreadCount } from "../chat/useUnreadCount";
import Avatar from "../components/Avatar";
import { Panel, StatusPill } from "../components/ui/Primitives";

const DAY_MS = 24 * 60 * 60 * 1000;

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

function startOfWeek(value) {
  const date = startOfDay(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date;
}

function daysUntil(value) {
  const date = toDate(value);
  if (!date) return null;
  return Math.ceil((startOfDay(date) - startOfDay(new Date())) / DAY_MS);
}

function formatDate(value) {
  const date = toDate(value);
  if (!date) return "-";

  return date.toLocaleDateString("sr-Latn-RS", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRelativeTraining(value) {
  const date = toDate(value);
  if (!date) return "-";

  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const dayDiff = Math.round((target - today) / DAY_MS);
  const time = date.toLocaleTimeString("sr-Latn-RS", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (dayDiff === 0) return `Danas u ${time}`;
  if (dayDiff === 1) return `Sutra u ${time}`;

  return date.toLocaleDateString("sr-Latn-RS", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatToday() {
  return new Date().toLocaleDateString("sr-Latn-RS", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function getFullName(profile = {}) {
  return [profile?.name, profile?.surname].filter(Boolean).join(" ");
}

function getAllowedCheckIns(membership, pkg) {
  const value =
    !membership?.weeklyCheckIns || membership.weeklyCheckIns === "default"
      ? pkg?.defaultCheckIns || "unlimited"
      : membership.weeklyCheckIns;

  return value === "unlimited" ? "unlimited" : Number(value);
}

function getWeekProgress(membership, pkg) {
  if (!membership) {
    return {
      weekIndex: 0,
      done: 0,
      allowed: 0,
      label: "Nema aktivne članarine",
      ratio: 0,
      remaining: 0,
    };
  }

  const start = startOfDay(toDate(membership.startDate));
  const end = startOfDay(toDate(membership.endDate));
  const today = startOfDay(new Date());
  const weekCount = Math.max(
    membership.checkInsArray?.length || 0,
    Math.max(1, Math.ceil((end - start) / (7 * DAY_MS)))
  );
  const rawWeek = Math.floor((today - start) / (7 * DAY_MS));
  const weekIndex = Math.min(Math.max(rawWeek, 0), weekCount - 1);
  const done = membership.checkInsArray?.[weekIndex] || 0;
  const allowed = getAllowedCheckIns(membership, pkg);
  const ratio = allowed === "unlimited" ? 1 : Math.min(done / allowed, 1);

  return {
    weekIndex,
    done,
    allowed,
    label: `${weekIndex + 1}. nedelja`,
    ratio,
    remaining: allowed === "unlimited" ? 0 : Math.max(allowed - done, 0),
  };
}

function getMembershipLife(membership) {
  if (!membership) return 0;

  const start = startOfDay(toDate(membership.startDate));
  const end = startOfDay(toDate(membership.endDate));
  const today = startOfDay(new Date());
  const total = Math.max(1, end - start);
  const used = Math.min(Math.max(today - start, 0), total);
  return used / total;
}

function getWeekKey(value) {
  return startOfWeek(value).toISOString().slice(0, 10);
}

function getWeeklyStreak(checkedBookings) {
  const activeWeeks = new Set(
    checkedBookings
      .map((booking) => toDate(booking.slotTimestamp))
      .filter(Boolean)
      .map(getWeekKey)
  );

  let cursor = startOfWeek(new Date());
  let streak = 0;

  for (let index = 0; index < 52; index += 1) {
    const key = getWeekKey(cursor);
    if (!activeWeeks.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 7);
  }

  return streak;
}

function getPreferredShift(checkedBookings) {
  if (!checkedBookings.length) return "Nema dovoljno podataka";

  const counts = checkedBookings.reduce(
    (result, booking) => {
      const date = toDate(booking.slotTimestamp);
      if (!date) return result;
      if (date.getHours() * 60 + date.getMinutes() < 15 * 60 + 30) result.morning += 1;
      else result.afternoon += 1;
      return result;
    },
    { morning: 0, afternoon: 0 }
  );

  if (counts.morning === counts.afternoon) return "Ravnomerno";
  return counts.morning > counts.afternoon ? "Prepodne" : "Popodne";
}

function getWeeklyTrend(checkedBookings, allowed) {
  const currentWeek = startOfWeek(new Date());
  const labels = ["Pre 3", "Pre 2", "Prošla", "Ova"];

  const weeks = labels.map((label, index) => {
    const weekStart = new Date(currentWeek);
    weekStart.setDate(currentWeek.getDate() - (3 - index) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const value = checkedBookings.filter((booking) => {
      const date = toDate(booking.slotTimestamp);
      return date && date >= weekStart && date < weekEnd;
    }).length;

    return {
      label,
      value,
      current: index === labels.length - 1,
    };
  });

  const target = allowed === "unlimited" ? null : Number(allowed) || null;
  const max = Math.max(1, target || 0, ...weeks.map((week) => week.value));

  return weeks.map((week) => ({
    ...week,
    target,
    max,
  }));
}

function CalendarIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function ActivityIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12h4l2-7 5 14 2-7h5" />
    </svg>
  );
}

function BellIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

function ArrowIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export default function ClientDashboard() {
  const { user, profile } = useAuth();
  const unread = useUnreadCount();
  const [bookings, setBookings] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [packages, setPackages] = useState([]);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    if (!user?.uid) return undefined;

    return onSnapshot(
      query(collection(db, "bookings"), where("userId", "==", user.uid)),
      (snapshot) => {
        setBookings(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      }
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;

    return onSnapshot(
      query(
        collection(db, "clientSubscriptions"),
        where("userId", "==", user.uid)
      ),
      (snapshot) => {
        setMemberships(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      }
    );
  }, [user?.uid]);

  useEffect(() => {
    return onSnapshot(collection(db, "subscriptions"), (snapshot) => {
      setPackages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "forumPosts"), orderBy("createdAt", "desc")),
      (snapshot) => {
        setPosts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      }
    );
  }, []);

  const packageById = useMemo(
    () => Object.fromEntries(packages.map((item) => [item.id, item])),
    [packages]
  );

  const futureBookings = useMemo(() => {
    const now = new Date();

    return bookings
      .filter((booking) => {
        const date = toDate(booking.slotTimestamp);
        return date && date >= now;
      })
      .sort((a, b) => toDate(a.slotTimestamp) - toDate(b.slotTimestamp));
  }, [bookings]);

  const checkedBookings = useMemo(() => {
    return bookings
      .filter((booking) => booking.checkedIn && toDate(booking.slotTimestamp))
      .sort((a, b) => toDate(b.slotTimestamp) - toDate(a.slotTimestamp));
  }, [bookings]);

  const nextBooking = futureBookings[0];

  const activeMembership = useMemo(() => {
    const today = startOfDay(new Date());

    return memberships
      .filter((membership) => {
        const end = toDate(membership.endDate);
        return membership.active !== false && end && end >= today;
      })
      .sort((a, b) => toDate(a.endDate) - toDate(b.endDate))[0];
  }, [memberships]);

  const activePackage = packageById[activeMembership?.subscriptionId];
  const weekProgress = getWeekProgress(activeMembership, activePackage);
  const membershipDaysLeft = daysUntil(activeMembership?.endDate);
  const membershipLife = getMembershipLife(activeMembership);
  const displayName = getFullName(profile);
  const latestPost = posts.find((post) => !post.archived);
  const readAnnouncements = profile?.readAnnouncements || [];
  const unreadAnnouncements = posts.filter(
    (post) => !post.archived && !readAnnouncements.includes(post.id)
  ).length;
  const last30Cutoff = new Date(Date.now() - 30 * DAY_MS);
  const last30Visits = checkedBookings.filter(
    (booking) => toDate(booking.slotTimestamp) >= last30Cutoff
  );
  const weeklyStreak = getWeeklyStreak(checkedBookings);
  const preferredShift = getPreferredShift(last30Visits);
  const weeklyTrend = getWeeklyTrend(checkedBookings, weekProgress.allowed);
  const needsAttention =
    unread > 0 ||
    unreadAnnouncements > 0 ||
    !nextBooking ||
    !activeMembership ||
    (activeMembership && membershipDaysLeft <= 7) ||
    (activeMembership && weekProgress.allowed !== "unlimited" && weekProgress.done === 0);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center gap-3 px-1">
        <Avatar
          name={displayName || "ReMotion"}
          photoURL={profile?.photoURL || ""}
          className="h-12 w-12 text-sm"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-500">
            {formatToday()}
          </p>
          <h1 className="truncate text-2xl font-semibold text-white">
            {displayName ? `Zdravo, ${profile?.name || displayName}` : "Zdravo"}
          </h1>
        </div>
      </div>

      <Panel className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-brand-blue-500/25 bg-brand-blue-500/10 text-brand-blue-300">
            <CalendarIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
              Sledeći trening
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold text-white">
              {nextBooking ? formatRelativeTraining(nextBooking.slotTimestamp) : "Nema zakazanog treninga"}
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              {nextBooking
                ? futureBookings.length > 1
                  ? `Još ${futureBookings.length - 1} zakazano`
                  : "Spremno za dolazak."
                : "Izaberi termin koji ti odgovara."}
            </p>
          </div>
          <Link
            to="/rezervacije"
            aria-label={nextBooking ? "Otvori termine" : "Rezerviši termin"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-300 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowIcon className="h-4 w-4" />
          </Link>
        </div>
      </Panel>

      <Panel className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
              Napredak
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              {activeMembership
                ? weekProgress.allowed === "unlimited"
                  ? `${weekProgress.done} dolazaka`
                  : `${weekProgress.done} / ${weekProgress.allowed} dolazaka`
                : "Nema aktivne članarine"}
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              {activeMembership
                ? weekProgress.allowed === "unlimited"
                  ? "Neograničen broj dolazaka."
                  : weekProgress.remaining
                    ? `Još ${weekProgress.remaining} do nedeljnog cilja.`
                    : "Nedeljni cilj je ispunjen."
                : "Javi se treneru za produženje."}
            </p>
          </div>
          <StatusPill
            tone={
              !activeMembership
                ? "red"
                : weekProgress.allowed === "unlimited" || weekProgress.ratio >= 1
                  ? "green"
                  : weekProgress.ratio >= 0.5
                    ? "amber"
                    : "red"
            }
          >
            {activeMembership ? weekProgress.label : "Neaktivna"}
          </StatusPill>
        </div>

        {activeMembership && weekProgress.allowed !== "unlimited" && (
          <SegmentedProgress
            value={weekProgress.done}
            allowed={weekProgress.allowed}
            ratio={weekProgress.ratio}
          />
        )}

        <MiniTrendGraph data={weeklyTrend} />

        <div className="grid grid-cols-3 gap-2">
          <Insight label="30 dana" value={`${last30Visits.length}`} detail="dolazaka" />
          <Insight label="Niz" value={`${weeklyStreak}`} detail="nedelja" />
          <Insight label="Termin" value={preferredShift} detail="najčešće" />
        </div>

        <Link
          to="/napredak"
          className="flex items-center justify-between gap-3 rounded-xl border border-brand-green-500/20 bg-brand-green-500/10 px-3 py-2.5 text-brand-green-100 transition hover:bg-brand-green-500/15"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white">
              Otvori detaljan napredak
            </span>
            <span className="block truncate text-xs text-brand-green-100/75">
              Merenja, san, BMI/BMR i milestones
            </span>
          </span>
          <ArrowIcon className="h-4 w-4 shrink-0" />
        </Link>
      </Panel>

      <Panel className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
              Članarina
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold text-white">
              {activeMembership
                ? activePackage?.name || activeMembership.name || "Aktivna članarina"
                : "Nema aktivne članarine"}
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              {activeMembership
                ? `Važi do ${formatDate(activeMembership.endDate)}`
                : "Profil i dolasci će se pojaviti kada članarina bude aktivna."}
            </p>
          </div>
          <StatusPill
            tone={
              !activeMembership
                ? "red"
                : membershipDaysLeft <= 7
                  ? "amber"
                  : "green"
            }
          >
            {activeMembership ? `${membershipDaysLeft} dana` : "Neaktivna"}
          </StatusPill>
        </div>

        {activeMembership && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-neutral-400">
              <span>Trajanje članarine</span>
              <span>{Math.round(membershipLife * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-neutral-800">
              <div
                className={`h-2 rounded-full transition-all ${
                  membershipDaysLeft <= 7 ? "bg-amber-400" : "bg-brand-green-500"
                }`}
                style={{ width: `${Math.round(membershipLife * 100)}%` }}
              />
            </div>
          </div>
        )}
      </Panel>

      {needsAttention && (
        <Panel className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 text-amber-200">
              <BellIcon className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold text-white">Vredi proveriti</p>
          </div>

          <div className="space-y-2">
            {!activeMembership && (
              <AttentionItem
                tone="red"
                title="Članarina nije aktivna"
                description="Javi se treneru za produženje."
                to="/profil/me"
              />
            )}
            {activeMembership && membershipDaysLeft <= 7 && (
              <AttentionItem
                tone="amber"
                title="Članarina uskoro ističe"
                description={`Preostalo je ${membershipDaysLeft} dana.`}
                to="/profil/me"
              />
            )}
            {!nextBooking && (
              <AttentionItem
                tone="blue"
                title="Nema zakazanog treninga"
                description="Rezerviši sledeći termin."
                to="/rezervacije"
              />
            )}
            {activeMembership && weekProgress.allowed !== "unlimited" && weekProgress.done === 0 && (
              <AttentionItem
                tone="amber"
                title="Nema dolazaka ove nedelje"
                description="Još uvek stigneš da uhvatiš ritam."
                to="/rezervacije"
              />
            )}
            {unread > 0 && (
              <AttentionItem
                tone="blue"
                title="Nove poruke"
                description={`${unread} nepročitano`}
                to="/chat"
              />
            )}
            {unreadAnnouncements > 0 && (
              <AttentionItem
                tone="amber"
                title="Nove objave"
                description={`${unreadAnnouncements} nepročitano`}
                to="/forum"
              />
            )}
          </div>
        </Panel>
      )}

      <Panel className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-brand-green-500/25 bg-brand-green-500/10 text-brand-green-300">
            <ActivityIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">
              Najnovije
            </p>
            <h2 className="mt-1 line-clamp-2 text-base font-semibold text-white">
              {latestPost?.title || "Nema novih objava"}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm text-neutral-400">
              {latestPost?.content || "Kada trener objavi nešto novo, pojaviće se ovde."}
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function SegmentedProgress({ value, allowed, ratio }) {
  const activeColor =
    ratio >= 1 ? "bg-brand-green-500" : ratio >= 0.5 ? "bg-amber-400" : "bg-red-500";

  return (
    <div className="flex gap-1">
      {Array.from({ length: allowed }, (_, index) => (
        <span
          key={index}
          className={`h-2 min-w-0 flex-1 rounded-sm ${
            index < value ? activeColor : "bg-neutral-700"
          }`}
        />
      ))}
    </div>
  );
}

function MiniTrendGraph({ data }) {
  const hasVisits = data.some((item) => item.value > 0);
  const target = data.find((item) => item.target)?.target;

  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-950/45 px-3 py-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">Ritam treninga</p>
          <p className="text-[11px] text-neutral-500">Poslednje 4 nedelje</p>
        </div>
        {target && (
          <span className="shrink-0 rounded-full border border-brand-blue-500/20 bg-brand-blue-500/10 px-2 py-1 text-[11px] font-medium text-brand-blue-200">
            cilj {target}
          </span>
        )}
      </div>

      <div className="grid h-24 grid-cols-4 items-end gap-2">
        {data.map((item) => {
          const height = item.value ? Math.max(16, Math.round((item.value / item.max) * 100)) : 8;
          return (
            <div key={item.label} className="flex h-full min-w-0 flex-col justify-end gap-1">
              <div className="flex flex-1 items-end rounded-full bg-white/[0.03] p-1">
                <div
                  className={`w-full rounded-full transition-all ${
                    item.current
                      ? "bg-brand-green-500 shadow-[0_0_18px_rgba(34,197,94,0.28)]"
                      : "bg-brand-blue-500/70"
                  }`}
                  style={{ height: `${height}%` }}
                />
              </div>
              <div className="text-center">
                <p className={`text-xs font-semibold ${item.current ? "text-brand-green-300" : "text-white"}`}>
                  {item.value}
                </p>
                <p className="truncate text-[10px] text-neutral-500">{item.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {!hasVisits && (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-400">
          Graf će se popuniti kako se budu beležili dolasci.
        </p>
      )}
    </div>
  );
}

function Insight({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-900/70 px-3 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-500">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-semibold text-white">{value}</p>
      <p className="truncate text-[11px] text-neutral-400">{detail}</p>
    </div>
  );
}

const attentionTones = {
  blue: "border-brand-blue-500/20 bg-brand-blue-500/10 text-brand-blue-200",
  amber: "border-amber-400/20 bg-amber-400/10 text-amber-100",
  red: "border-red-400/20 bg-red-500/10 text-red-200",
};

function AttentionItem({ title, description, to, tone = "blue" }) {
  return (
    <Link
      to={to}
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition hover:bg-white/10 ${
        attentionTones[tone] || attentionTones.blue
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-white">
          {title}
        </span>
        <span className="block truncate text-xs opacity-75">
          {description}
        </span>
      </span>
      <ArrowIcon className="h-4 w-4 shrink-0 opacity-75" />
    </Link>
  );
}
