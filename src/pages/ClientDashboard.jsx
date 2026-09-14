import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useUnreadCount } from "../chat/useUnreadCount";
import Avatar from "../components/Avatar";
import { Panel, StatusPill } from "../components/ui/Primitives";
import { sumMeals } from "../data/nutritionCatalog";

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

function getDateKey(value = new Date()) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  }).replace(/\.$/, "");
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

function getSleepTrend(healthLogs) {
  const logsByDate = Object.fromEntries(healthLogs.map((log) => [log.dateKey, log]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const value = Number(logsByDate[getDateKey(date)]?.sleepHours) || 0;
    return {
      label: date.toLocaleDateString("sr-Latn-RS", { weekday: "short" }).replace(".", ""),
      value,
      max: 12,
      current: index === 6,
    };
  });
}

function getWeightTrend(healthLogs) {
  const entries = healthLogs
    .filter((log) => Number(log.bodyMeasurement?.weightKg) > 0)
    .sort((a, b) => (a.dateKey || "").localeCompare(b.dateKey || ""))
    .slice(-6);

  if (!entries.length) return [];
  const values = entries.map((log) => Number(log.bodyMeasurement.weightKg));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 1);

  return entries.map((log, index) => {
    const date = new Date(`${log.dateKey}T12:00:00`);
    return {
      label: date.toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "numeric" }),
      value: Number(log.bodyMeasurement.weightKg),
      chartValue: Number(log.bodyMeasurement.weightKg) - minimum + range * 0.2,
      max: range * 1.4,
      current: index === entries.length - 1,
    };
  });
}

function getNextAchievement({ checkedBookings, healthLogs, weeklyStreak, earnedAchievements }) {
  const visits = checkedBookings.length;
  const sleepEntries = healthLogs.filter((log) => log.sleepHours !== undefined).length;
  const nutritionEntries = healthLogs.filter(
    (log) => Array.isArray(log.nutritionMeals) && log.nutritionMeals.length > 0
  ).length;
  const candidates = [
    { id: "first_visit", title: "Prvi dolazak", current: Math.min(visits, 1), target: 1 },
    { id: "visits_10", title: "10 dolazaka", current: Math.min(visits, 10), target: 10 },
    { id: "visits_25", title: "25 dolazaka", current: Math.min(visits, 25), target: 25 },
    { id: "three_week_streak", title: "3 nedelje u nizu", current: Math.min(weeklyStreak, 3), target: 3 },
    { id: "seven_sleep_logs", title: "7 zapisa sna", current: Math.min(sleepEntries, 7), target: 7 },
    { id: "first_nutrition_log", title: "Prvi dnevnik ishrane", current: Math.min(nutritionEntries, 1), target: 1 },
  ];
  const earned = new Set(Array.isArray(earnedAchievements) ? earnedAchievements : []);

  return candidates
    .filter((item) => !earned.has(item.id) && item.current < item.target)
    .sort((a, b) => b.current / b.target - a.current / a.target)[0] || null;
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
  const [healthLogs, setHealthLogs] = useState([]);
  const [trendView, setTrendView] = useState("visits");
  const [savingEffort, setSavingEffort] = useState(false);

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

  useEffect(() => {
    if (!user?.uid) return undefined;
    return onSnapshot(
      query(collection(db, "healthLogs"), where("userId", "==", user.uid)),
      (snapshot) => {
        setHealthLogs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      }
    );
  }, [user?.uid]);

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
  const displayName = getFullName(profile);
  const latestPost = posts.find((post) => !post.archived);
  const readAnnouncements = profile?.readAnnouncements || [];
  const unreadAnnouncements = posts.filter(
    (post) => !post.archived && !readAnnouncements.includes(post.id)
  ).length;
  const weeklyStreak = getWeeklyStreak(checkedBookings);
  const weeklyTrend = getWeeklyTrend(checkedBookings, weekProgress.allowed);
  const sleepTrend = getSleepTrend(healthLogs);
  const weightTrend = getWeightTrend(healthLogs);
  const todayKey = getDateKey();
  const todayLog = healthLogs.find((log) => log.dateKey === todayKey) || {};
  const todayMeals = Array.isArray(todayLog.nutritionMeals) ? todayLog.nutritionMeals : [];
  const todayNutrition = sumMeals(todayMeals);
  const todayCheckedIn = checkedBookings.some(
    (booking) => getDateKey(toDate(booking.slotTimestamp)) === todayKey
  );
  const nextAchievement = getNextAchievement({
    checkedBookings,
    healthLogs,
    weeklyStreak,
    earnedAchievements: profile?.achievements,
  });
  const needsAttention =
    unread > 0 ||
    !nextBooking ||
    !activeMembership ||
    (activeMembership && membershipDaysLeft <= 7) ||
    (activeMembership && weekProgress.allowed !== "unlimited" && weekProgress.done === 0);

  async function saveTrainingEffort(trainingEffort) {
    if (!user?.uid) return;
    setSavingEffort(true);
    try {
      await setDoc(
        doc(db, "healthLogs", `${user.uid}_${todayKey}`),
        {
          userId: user.uid,
          dateKey: todayKey,
          trainingEffort,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Training effort save failed", error);
    } finally {
      setSavingEffort(false);
    }
  }

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

      <Panel className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">Danas</p>
          <Link to="/napredak" className="text-xs font-medium text-brand-blue-300">
            Otvori napredak
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <TodayItem
            to="/napredak?tab=sleep"
            label="San"
            value={todayLog.sleepHours !== undefined ? `${todayLog.sleepHours} h` : "Upiši"}
            detail={todayLog.sleepQuality ? "sačuvano" : "oporavak"}
            tone={Number(todayLog.sleepHours) >= 7.5 ? "green" : todayLog.sleepHours !== undefined ? "amber" : "blue"}
          />
          <TodayItem
            to="/napredak?tab=nutrition"
            label="Ishrana"
            value={todayMeals.length ? `${Math.round(todayNutrition.calories)} kcal` : "Upiši"}
            detail={todayMeals.length ? `${todayMeals.length} obroka` : "dnevnik"}
            tone={todayMeals.length ? "green" : "blue"}
          />
          <TodayItem
            to="/rezervacije"
            label="Trening"
            value={todayCheckedIn ? "Završeno" : activeMembership ? `${weekProgress.done}${weekProgress.allowed === "unlimited" ? "" : ` / ${weekProgress.allowed}`}` : "-"}
            detail={todayCheckedIn ? "danas" : activeMembership ? "ove nedelje" : "bez članarine"}
            tone={todayCheckedIn ? "green" : "blue"}
          />
        </div>

        {todayCheckedIn && (
          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
            <p className="text-xs font-medium text-neutral-300">Kako je bilo danas?</p>
            <div className="flex gap-1">
              {[
                { value: "easy", label: "Lako" },
                { value: "normal", label: "Dobro" },
                { value: "hard", label: "Teško" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  disabled={savingEffort}
                  onClick={() => saveTrainingEffort(item.value)}
                  className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition disabled:opacity-50 ${
                    todayLog.trainingEffort === item.value
                      ? "bg-brand-blue-500 text-white"
                      : "bg-white/5 text-neutral-400 hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <Panel className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Trend</p>
            <p className="text-[11px] text-neutral-500">
              {trendView === "visits" ? "Poslednje 4 nedelje" : trendView === "sleep" ? "Poslednjih 7 dana" : "Poslednjih 6 merenja"}
            </p>
          </div>
          <div className="flex rounded-lg bg-neutral-950/70 p-1">
            {[
              { value: "visits", label: "Dolasci" },
              { value: "weight", label: "Težina" },
              { value: "sleep", label: "San" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTrendView(option.value)}
                className={`rounded-md px-2 py-1.5 text-[10px] font-medium transition ${
                  trendView === option.value
                    ? "bg-brand-blue-500 text-white"
                    : "text-neutral-500"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <MiniTrendGraph
          data={trendView === "visits" ? weeklyTrend : trendView === "sleep" ? sleepTrend : weightTrend}
          unit={trendView === "sleep" ? "h" : trendView === "weight" ? "kg" : ""}
          emptyText={
            trendView === "weight"
              ? "Upiši merenje da bi se pojavio trend težine."
              : trendView === "sleep"
                ? "Upiši san da bi se pojavio sedmodnevni trend."
                : "Graf će se popuniti kako se budu beležili dolasci."
          }
        />

        <Link
          to="/napredak?tab=achievements"
          className="flex items-center justify-between gap-3 border-t border-white/10 pt-3"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-neutral-500">Sledeće dostignuće</span>
            <span className="block truncate text-sm font-semibold text-white">
              {nextAchievement?.title || "Sva dostignuća ostvarena"}
            </span>
          </span>
          {nextAchievement && (
            <span className="shrink-0 text-xs font-medium text-amber-200">
              {nextAchievement.current} / {nextAchievement.target}
            </span>
          )}
          <ArrowIcon className="h-4 w-4 shrink-0 text-neutral-500" />
        </Link>
      </Panel>

      <Link to="/profil/me?tab=memberships" className="block">
        <Panel className="flex items-center justify-between gap-3 p-3.5 transition hover:bg-white/[0.04]">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
              Članarina
            </p>
            <p className="truncate text-sm font-semibold text-white">
              {activeMembership
                ? activePackage?.name || activeMembership.name || "Aktivna članarina"
                : "Nema aktivne članarine"}
            </p>
            {activeMembership && (
              <p className="text-xs text-neutral-500">Važi do {formatDate(activeMembership.endDate)}</p>
            )}
          </div>
          <StatusPill
            tone={!activeMembership ? "red" : membershipDaysLeft <= 7 ? "amber" : "green"}
          >
            {activeMembership ? `${membershipDaysLeft} dana` : "Neaktivna"}
          </StatusPill>
        </Panel>
      </Link>

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
          </div>
        </Panel>
      )}

      {unreadAnnouncements > 0 && latestPost && (
        <Link to="/forum" className="block">
          <Panel className="flex items-center gap-3 p-3.5 transition hover:bg-white/[0.04]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-green-500/25 bg-brand-green-500/10 text-brand-green-300">
              <ActivityIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">Novo na Forumu</p>
              <p className="truncate text-sm font-semibold text-white">{latestPost.title}</p>
            </div>
            <ArrowIcon className="h-4 w-4 shrink-0 text-neutral-500" />
          </Panel>
        </Link>
      )}
    </div>
  );
}

function TodayItem({ to, label, value, detail, tone = "blue" }) {
  const toneClass = {
    blue: "text-brand-blue-300",
    green: "text-brand-green-300",
    amber: "text-amber-200",
  }[tone];

  return (
    <Link
      to={to}
      className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2.5 transition hover:bg-white/[0.08]"
    >
      <span className="block text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-500">
        {label}
      </span>
      <span className={`mt-1 block truncate text-sm font-semibold ${toneClass}`}>{value}</span>
      <span className="block truncate text-[10px] text-neutral-500">{detail}</span>
    </Link>
  );
}

function MiniTrendGraph({ data, unit = "", emptyText }) {
  const hasValues = data.some((item) => item.value > 0);

  return (
    <div className="rounded-xl border border-white/10 bg-neutral-950/45 px-3 py-3">
      <div
        className="grid h-24 items-end gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(data.length, 1)}, minmax(0, 1fr))` }}
      >
        {data.map((item) => {
          const chartValue = item.chartValue ?? item.value;
          const height = item.value ? Math.max(12, Math.round((chartValue / item.max) * 100)) : 6;
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
                  {item.value ? `${Number(item.value).toLocaleString("sr-Latn-RS", { maximumFractionDigits: 1 })}${unit}` : "-"}
                </p>
                <p className="truncate text-[10px] text-neutral-500">{item.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {!hasValues && (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-400">
          {emptyText}
        </p>
      )}
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
