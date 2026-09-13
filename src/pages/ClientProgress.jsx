import { useEffect, useMemo, useState } from "react";
import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { Panel, StatusPill } from "../components/ui/Primitives";
import NutritionTracker from "../components/nutrition/NutritionTracker";

const DAY_MS = 24 * 60 * 60 * 1000;
const TAB_OPTIONS = [
  { value: "sleep", label: "San" },
  { value: "nutrition", label: "Ishrana" },
  { value: "training", label: "Trening" },
  { value: "body", label: "Mere" },
];

const SLEEP_QUALITY_OPTIONS = [
  { value: "poor", label: "Loše" },
  { value: "okay", label: "Solidno" },
  { value: "good", label: "Dobro" },
];

const SLEEP_WAKEUP_OPTIONS = [
  { value: "none", label: "Nisam" },
  { value: "once", label: "Jednom" },
  { value: "multiple", label: "Više puta" },
];

const MEASUREMENT_FIELDS = [
  { key: "waist", label: "Struk" },
  { key: "chest", label: "Grudi" },
  { key: "hips", label: "Kukovi" },
  { key: "arm", label: "Ruka" },
  { key: "thigh", label: "Butina" },
  { key: "shoulders", label: "Ramena" },
];

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

function getWeekKey(value) {
  return startOfWeek(value).toISOString().slice(0, 10);
}

function getAge(profile = {}) {
  if (profile.age) return Number(profile.age);
  const dob = toDate(profile.dob);
  if (!dob) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age > 0 ? age : null;
}

function calculateBmi(heightCm, weightKg) {
  if (!heightCm || !weightKg) return null;
  const meters = Number(heightCm) / 100;
  if (!meters) return null;
  return Number(weightKg) / (meters * meters);
}

function calculateBmr({ heightCm, weightKg, age, sex }) {
  if (!heightCm || !weightKg || !age || !sex) return null;
  const sexOffset = sex === "female" ? -161 : 5;
  return 10 * Number(weightKg) + 6.25 * Number(heightCm) - 5 * age + sexOffset;
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number(value).toLocaleString("sr-Latn-RS", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function getAllowedCheckIns(membership, pkg) {
  const value =
    !membership?.weeklyCheckIns || membership.weeklyCheckIns === "default"
      ? pkg?.defaultCheckIns || "unlimited"
      : membership.weeklyCheckIns;

  return value === "unlimited" ? "unlimited" : Number(value);
}

function getActiveMembership(memberships) {
  const today = startOfDay(new Date());
  return memberships
    .filter((membership) => {
      const end = toDate(membership.endDate);
      return membership.active !== false && end && end >= today;
    })
    .sort((a, b) => toDate(a.endDate) - toDate(b.endDate))[0];
}

function getWeekProgress(membership, pkg) {
  if (!membership) return { done: 0, allowed: 0, ratio: 0, remaining: 0 };

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

  return {
    done,
    allowed,
    ratio: allowed === "unlimited" ? 1 : Math.min(done / allowed, 1),
    remaining: allowed === "unlimited" ? 0 : Math.max(allowed - done, 0),
  };
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
    if (!activeWeeks.has(getWeekKey(cursor))) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

function getBestWeek(checkedBookings) {
  const counts = {};
  checkedBookings.forEach((booking) => {
    const date = toDate(booking.slotTimestamp);
    if (!date) return;
    const key = getWeekKey(date);
    counts[key] = (counts[key] || 0) + 1;
  });
  return Math.max(0, ...Object.values(counts));
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

function getSleepMeta(hours) {
  if (hours === undefined || hours === null || hours === "" || Number.isNaN(Number(hours))) {
    return {
      tone: "neutral",
      label: "Nije upisano",
      percent: 0,
      description: "Unos nije obavezan. Dovoljno je povremeno pratiti ritam.",
    };
  }

  const numericHours = Number(hours);
  const percent = Math.max(0, Math.min(100, (numericHours / 12) * 100));
  if (numericHours === 0) {
    return {
      tone: "red",
      label: "Bez sna",
      percent,
      description: "Noć bez sna zahteva oprez i lakši tempo kad god je moguće.",
    };
  }
  if (numericHours < 6) {
    return {
      tone: "red",
      label: "Premalo",
      percent,
      description: "Ispod 6h je signal za oprez, posebno uz jače treninge.",
    };
  }
  if (numericHours < 7.5) {
    return {
      tone: "amber",
      label: "Može bolje",
      percent,
      description: "Solidno za povremeno, ali ciljaj stabilnije noći.",
    };
  }
  if (numericHours <= 10) {
    return {
      tone: "green",
      label: "Odlično",
      percent,
      description: "Ovo je zona u kojoj se telo najbolje oporavlja.",
    };
  }
  return {
    tone: "amber",
    label: "Predugo",
    percent: 100,
    description: "Ako često treba više od 10h, obrati pažnju na umor.",
  };
}

function getSleepOptionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || "Nije upisano";
}

function getSleepReview({ hours, napMinutes, sleepQuality, sleepWakeups }) {
  let primary;
  if (hours === 0) {
    primary = "Noć bez sna. Danas smanji intenzitet i daj prednost oporavku.";
  } else if (hours < 6) {
    primary = "San je bio kratak. Danas obrati pažnju na energiju i oporavak.";
  } else if (hours < 7.5) {
    primary = "Trajanje sna je solidno, ali bi malo više sna verovatno poboljšalo oporavak.";
  } else if (hours <= 10) {
    primary = "Trajanje sna je u dobroj zoni za oporavak.";
  } else {
    primary = "San je bio duži nego obično. Prati da li se ipak osećaš odmorno.";
  }

  let secondary = "";
  if (sleepQuality === "poor") {
    secondary = "Loš osećaj odmora govori da sam broj sati možda ne prikazuje celu sliku.";
  } else if (sleepWakeups === "multiple") {
    secondary = "Više buđenja može značajno umanjiti kvalitet sna.";
  } else if (napMinutes >= 90) {
    secondary = "Duža dremka može pomoći danas, ali može otežati večerašnje uspavljivanje.";
  } else if (napMinutes > 0 && hours < 7.5) {
    secondary = "Kratka dremka može donekle nadoknaditi manjak sna.";
  } else if (sleepQuality === "good") {
    secondary = "Dobar osećaj odmora potvrđuje da ti je ova količina sna prijala.";
  }

  return [primary, secondary].filter(Boolean).join(" ");
}

function getBmiTone(bmi) {
  if (!bmi) return "neutral";
  if (bmi < 18.5) return "amber";
  if (bmi < 25) return "green";
  if (bmi < 30) return "amber";
  return "red";
}

function getMilestones({ checkedBookings, last30Visits, weeklyStreak, bestWeek }) {
  const total = checkedBookings.length;
  return [
    {
      title: "Prvi dolazak",
      complete: total >= 1,
      detail: total >= 1 ? "upisano" : "čeka prvi check-in",
    },
    {
      title: "10 dolazaka",
      complete: total >= 10,
      detail: `${Math.min(total, 10)} / 10`,
    },
    {
      title: "4 treninga u nedelji",
      complete: bestWeek >= 4,
      detail: `${Math.min(bestWeek, 4)} / 4`,
    },
    {
      title: "3 nedelje u nizu",
      complete: weeklyStreak >= 3,
      detail: `${Math.min(weeklyStreak, 3)} / 3`,
    },
    {
      title: "8 dolazaka za 30 dana",
      complete: last30Visits.length >= 8,
      detail: `${Math.min(last30Visits.length, 8)} / 8`,
    },
  ];
}

function TrainingIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="M6 9v6" />
      <path d="M18 9v6" />
      <path d="M8 12h8" />
      <path d="M12 5v3" />
      <path d="M12 16v3" />
    </svg>
  );
}

function RulerIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m4 15 11-11 5 5L9 20l-5-5Z" />
      <path d="m8 11 2 2" />
      <path d="m11 8 2 2" />
      <path d="m14 5 2 2" />
    </svg>
  );
}

function TargetIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  );
}

function TrophyIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M5 5H3v2a4 4 0 0 0 4 4" />
      <path d="M19 5h2v2a4 4 0 0 1-4 4" />
    </svg>
  );
}

export default function ClientProgress() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState("sleep");
  const [bookings, setBookings] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [packages, setPackages] = useState([]);
  const [healthLogs, setHealthLogs] = useState([]);
  const [trainerMeals, setTrainerMeals] = useState([]);
  const [savingLog, setSavingLog] = useState(false);
  const [savingFood, setSavingFood] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [status, setStatus] = useState(null);

  const todayKey = getDateKey();
  const todayLog = healthLogs.find((log) => log.dateKey === todayKey) || {};

  const [profileForm, setProfileForm] = useState({
    heightCm: "",
    weightKg: "",
    age: "",
    sex: "",
    measurements: {},
  });

  useEffect(() => {
    setProfileForm({
      heightCm: profile?.heightCm || profile?.height || "",
      weightKg: profile?.weightKg || profile?.weight || "",
      age: profile?.age || getAge(profile) || "",
      sex: profile?.sex || profile?.gender || "",
      measurements: {
        waist: profile?.measurements?.waist || "",
        chest: profile?.measurements?.chest || "",
        hips: profile?.measurements?.hips || "",
        arm: profile?.measurements?.arm || "",
        thigh: profile?.measurements?.thigh || "",
        shoulders: profile?.measurements?.shoulders || "",
      },
    });
  }, [profile]);

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
    return onSnapshot(
      collection(db, "nutritionMealTemplates"),
      (snapshot) => {
        setTrainerMeals(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .filter((item) => item.active !== false && Array.isArray(item.items))
        );
      },
      (error) => {
        console.warn("Trainer meals are not available", error);
        setTrainerMeals([]);
      }
    );
  }, []);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return onSnapshot(
      query(collection(db, "clientSubscriptions"), where("userId", "==", user.uid)),
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
    if (!user?.uid) return undefined;
    return onSnapshot(
      query(collection(db, "healthLogs"), where("userId", "==", user.uid)),
      (snapshot) => {
        setHealthLogs(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (b.dateKey || "").localeCompare(a.dateKey || ""))
        );
      }
    );
  }, [user?.uid]);

  const packageById = useMemo(
    () => Object.fromEntries(packages.map((item) => [item.id, item])),
    [packages]
  );

  const activeMembership = useMemo(() => getActiveMembership(memberships), [memberships]);
  const activePackage = packageById[activeMembership?.subscriptionId];
  const weekProgress = getWeekProgress(activeMembership, activePackage);

  const checkedBookings = useMemo(() => {
    return bookings
      .filter((booking) => booking.checkedIn && toDate(booking.slotTimestamp))
      .sort((a, b) => toDate(b.slotTimestamp) - toDate(a.slotTimestamp));
  }, [bookings]);

  const last30Cutoff = new Date(Date.now() - 30 * DAY_MS);
  const last30Visits = checkedBookings.filter(
    (booking) => toDate(booking.slotTimestamp) >= last30Cutoff
  );
  const weeklyStreak = getWeeklyStreak(checkedBookings);
  const bestWeek = getBestWeek(checkedBookings);
  const preferredShift = getPreferredShift(last30Visits);
  const milestones = getMilestones({
    checkedBookings,
    last30Visits,
    weeklyStreak,
    bestWeek,
  });

  const bodyStats = useMemo(() => {
    const heightCm = Number(profile?.heightCm || profile?.height || 0) || null;
    const weightKg = Number(profile?.weightKg || profile?.weight || 0) || null;
    const age = getAge(profile);
    const sex = profile?.sex || profile?.gender || "";
    const bmi = calculateBmi(heightCm, weightKg);
    const bmr = calculateBmr({ heightCm, weightKg, age, sex });
    return { heightCm, weightKg, age, sex, bmi, bmr };
  }, [profile]);

  function showStatus(type, message) {
    setStatus({ type, message });
    window.setTimeout(() => setStatus(null), 2800);
  }

  async function saveTodayLog(updates) {
    if (!user?.uid) return false;

    setSavingLog(true);
    try {
      await setDoc(
        doc(db, "healthLogs", `${user.uid}_${todayKey}`),
        {
          userId: user.uid,
          dateKey: todayKey,
          ...updates,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      showStatus("success", "Sačuvano.");
      return true;
    } catch (error) {
      console.error("Health log save failed", error);
      showStatus("error", "Nije sačuvano. Proveri konekciju i pokušaj ponovo.");
      return false;
    } finally {
      setSavingLog(false);
    }
  }

  async function saveProfileStats() {
    if (!user?.uid) return;

    const measurements = Object.fromEntries(
      MEASUREMENT_FIELDS.map((field) => [
        field.key,
        profileForm.measurements?.[field.key]
          ? Number(profileForm.measurements[field.key])
          : "",
      ])
    );

    setSavingProfile(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        heightCm: profileForm.heightCm ? Number(profileForm.heightCm) : "",
        weightKg: profileForm.weightKg ? Number(profileForm.weightKg) : "",
        age: profileForm.age ? Number(profileForm.age) : "",
        sex: profileForm.sex || "",
        measurements,
        measurementsUpdatedAt: serverTimestamp(),
      });
      showStatus("success", "Podaci su sačuvani.");
    } catch (error) {
      console.error("Profile stats save failed", error);
      showStatus("error", "Podaci nisu sačuvani. Pokušaj ponovo.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function createCustomFood(food) {
    if (!user?.uid) return null;

    const createdFood = {
      ...food,
      id: `personal_${globalThis.crypto?.randomUUID?.() || Date.now()}`,
      catalogStatus: "personal",
      createdBy: user.uid,
      createdAt: new Date().toISOString(),
    };

    setSavingFood(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        nutritionFoods: arrayUnion(createdFood),
      });
      showStatus("success", "Namirnica je sačuvana.");
      return createdFood;
    } catch (error) {
      console.error("Custom food save failed", error);
      showStatus("error", "Namirnica nije sačuvana. Pokušaj ponovo.");
      return null;
    } finally {
      setSavingFood(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="grid grid-cols-4 gap-1 overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/70 p-1">
        {TAB_OPTIONS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`rounded-xl px-1.5 py-2 text-[11px] font-medium transition ${
              activeTab === tab.value
                ? "bg-brand-blue-500 text-white shadow-glow"
                : "text-neutral-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

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

      {activeTab === "sleep" && (
        <SleepTab
          key={todayLog.sleepHours ?? "no-entry"}
          todayLog={todayLog}
          saving={savingLog}
          onSave={saveTodayLog}
        />
      )}

      {activeTab === "nutrition" && (
        <NutritionTracker
          todayLog={todayLog}
          personalFoods={Array.isArray(profile?.nutritionFoods) ? profile.nutritionFoods : []}
          trainerMeals={trainerMeals}
          saving={savingLog}
          savingFood={savingFood}
          onSave={saveTodayLog}
          onCreateFood={createCustomFood}
        />
      )}

      {activeTab === "training" && (
        <TrainingTab
          activeMembership={activeMembership}
          weekProgress={weekProgress}
          last30Visits={last30Visits}
          weeklyStreak={weeklyStreak}
          bestWeek={bestWeek}
          preferredShift={preferredShift}
          milestones={milestones}
          todayLog={todayLog}
          saving={savingLog}
          onSave={saveTodayLog}
        />
      )}

      {activeTab === "body" && (
        <BodyTab
          profileForm={profileForm}
          setProfileForm={setProfileForm}
          bodyStats={bodyStats}
          saving={savingProfile}
          onSave={saveProfileStats}
        />
      )}
    </div>
  );
}

function SleepTab({ todayLog, saving, onSave }) {
  const savedHours = Number(todayLog.sleepHours);
  const hasEntry =
    todayLog.sleepHours !== undefined &&
    todayLog.sleepHours !== null &&
    !Number.isNaN(savedHours);
  const [hours, setHours] = useState(hasEntry ? savedHours : 8);
  const [bedtime, setBedtime] = useState(todayLog.bedtime || "");
  const [napMinutes, setNapMinutes] = useState(Number(todayLog.napMinutes) || 0);
  const [sleepQuality, setSleepQuality] = useState(todayLog.sleepQuality || "");
  const [sleepWakeups, setSleepWakeups] = useState(todayLog.sleepWakeups || "");
  const [editing, setEditing] = useState(!hasEntry);
  const [savedLocally, setSavedLocally] = useState(false);
  const selectedSleepMeta = getSleepMeta(hours);
  const showSummary = (hasEntry || savedLocally) && !editing;

  function resetForm() {
    setHours(hasEntry ? savedHours : 8);
    setBedtime(todayLog.bedtime || "");
    setNapMinutes(Number(todayLog.napMinutes) || 0);
    setSleepQuality(todayLog.sleepQuality || "");
    setSleepWakeups(todayLog.sleepWakeups || "");
  }

  async function saveEntry() {
    const saved = await onSave({
      sleepHours: Number(hours),
      bedtime,
      napMinutes: Number(napMinutes),
      sleepQuality,
      sleepWakeups,
    });
    if (saved) {
      setSavedLocally(true);
      setEditing(false);
    }
  }

  if (showSummary) {
    const review = getSleepReview({
      hours: Number(hours),
      napMinutes: Number(napMinutes),
      sleepQuality,
      sleepWakeups,
    });

    return (
      <Panel className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-xl font-semibold text-white">{hours} h</p>
            <StatusPill tone={selectedSleepMeta.tone}>{selectedSleepMeta.label}</StatusPill>
            {bedtime && (
              <span className="text-[11px] text-neutral-400">Legli {bedtime}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:bg-white/5"
          >
            Izmeni
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <SleepSummaryItem
            label="Dremka"
            value={napMinutes ? `${napMinutes} min` : "Nije bilo"}
          />
          <SleepSummaryItem
            label="Odmor"
            value={getSleepOptionLabel(SLEEP_QUALITY_OPTIONS, sleepQuality)}
          />
          <SleepSummaryItem
            label="Buđenja"
            value={getSleepOptionLabel(SLEEP_WAKEUP_OPTIONS, sleepWakeups)}
          />
        </div>

        <p className="mt-2.5 rounded-xl border border-brand-blue-400/15 bg-brand-blue-500/10 px-3 py-2 text-xs leading-relaxed text-brand-blue-100">
          {review}
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xl font-semibold text-white">{hours} h</p>
          <StatusPill tone={selectedSleepMeta.tone}>{selectedSleepMeta.label}</StatusPill>
        </div>
        <input
          type="range"
          min="0"
          max="12"
          step="0.5"
          value={hours}
          onChange={(event) => setHours(Number(event.target.value))}
          aria-label="Broj sati sna"
          className="sleep-guideline-range w-full"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
          <span>0h</span>
          <span>12h</span>
        </div>

        <label className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs font-medium text-white">
          <span>Odlazak na spavanje</span>
          <input
            type="time"
            value={bedtime}
            onChange={(event) => setBedtime(event.target.value)}
            className="w-28 rounded-lg border border-white/10 bg-neutral-950/60 px-2 py-1.5 text-xs text-white outline-none focus:border-brand-blue-500"
          />
        </label>

        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-white">Dremka</span>
            <span className="text-neutral-300">
              {napMinutes ? `${napMinutes} min` : "Nije bilo"}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="180"
            step="15"
            value={napMinutes}
            onChange={(event) => setNapMinutes(Number(event.target.value))}
            aria-label="Trajanje dremke u minutima"
            className="mt-2 w-full accent-brand-blue-500"
          />
        </div>

        <SleepChoiceRow
          label="Osećaj odmora"
          value={sleepQuality}
          onChange={setSleepQuality}
          options={SLEEP_QUALITY_OPTIONS}
        />

        <SleepChoiceRow
          label="Buđenja"
          value={sleepWakeups}
          onChange={setSleepWakeups}
          options={SLEEP_WAKEUP_OPTIONS}
        />

        <div className={`mt-3 grid gap-2 ${hasEntry ? "grid-cols-2" : "grid-cols-1"}`}>
          {hasEntry && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                resetForm();
                setEditing(false);
              }}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-neutral-300 transition hover:bg-white/5 disabled:opacity-60"
            >
              Otkaži
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={saveEntry}
            className="rounded-xl bg-brand-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-glow disabled:opacity-60"
          >
            {saving ? "Čuvanje..." : hasEntry ? "Sačuvaj" : "Upiši"}
          </button>
        </div>
    </Panel>
  );
}

function SleepSummaryItem({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg bg-white/[0.04] px-2 py-1.5">
      <p className="text-[10px] text-neutral-500">{label}</p>
      <p className="truncate text-[11px] font-medium text-neutral-200">{value}</p>
    </div>
  );
}

function SleepChoiceRow({ label, value, onChange, options }) {
  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <p className="mb-1.5 text-xs font-medium text-white">{label}</p>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-950/55 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(value === option.value ? "" : option.value)}
            className={`min-h-8 rounded-lg px-1.5 py-1.5 text-[11px] font-medium transition ${
              value === option.value
                ? "bg-brand-blue-500 text-white"
                : "text-neutral-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TrainingTab({
  activeMembership,
  weekProgress,
  last30Visits,
  weeklyStreak,
  bestWeek,
  preferredShift,
  milestones,
  todayLog,
  saving,
  onSave,
}) {
  return (
    <div className="space-y-4">
      <Panel className="space-y-4 p-4">
        <SectionHeader
          icon={<TrainingIcon className="h-5 w-5" />}
          title="Trening"
          subtitle="Ovaj deo se najvećim delom puni automatski iz dolazaka."
        />

        <div className="grid grid-cols-2 gap-2">
          <Metric label="30 dana" value={`${last30Visits.length}`} detail="dolazaka" />
          <Metric label="Niz" value={`${weeklyStreak}`} detail="nedelja" />
          <Metric label="Najbolja nedelja" value={`${bestWeek}`} detail="dolazaka" />
          <Metric label="Termin" value={preferredShift} detail="najčešće" />
        </div>

        {activeMembership ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white">Ova nedelja</p>
              <p className="text-sm font-semibold text-white">
                {weekProgress.done} / {weekProgress.allowed === "unlimited" ? "∞" : weekProgress.allowed}
              </p>
            </div>
            {weekProgress.allowed === "unlimited" ? (
              <p className="text-xs text-neutral-400">Neograničen broj dolazaka.</p>
            ) : (
              <SegmentedProgress
                value={weekProgress.done}
                allowed={weekProgress.allowed}
                ratio={weekProgress.ratio}
              />
            )}
          </div>
        ) : (
          <InfoNote>Nema aktivne članarine, pa se trenutni trening cilj ne prikazuje.</InfoNote>
        )}
      </Panel>

      <Panel className="space-y-3 p-4">
        <SectionHeader
          icon={<TargetIcon className="h-5 w-5" />}
          title="Kako je bilo danas?"
          subtitle="Opcionalno. Korisno treneru ako klijent želi da prati osećaj."
        />
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: "easy", label: "Lako" },
            { value: "normal", label: "Normalno" },
            { value: "hard", label: "Teško" },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              disabled={saving}
              onClick={() => onSave({ trainingEffort: item.value })}
              className={`rounded-xl border px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
                todayLog.trainingEffort === item.value
                  ? "border-brand-blue-500 bg-brand-blue-500 text-white"
                  : "border-white/10 bg-white/5 text-neutral-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel className="space-y-4 p-4">
        <SectionHeader
          icon={<TrophyIcon className="h-5 w-5" />}
          title="Milestones"
          subtitle="Automatski ciljevi iz dolazaka, bez dodatnog unosa."
        />
        <div className="space-y-2">
          {milestones.map((milestone) => (
            <Milestone
              key={milestone.title}
              title={milestone.title}
              detail={milestone.detail}
              complete={milestone.complete}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function BodyTab({ profileForm, setProfileForm, bodyStats, saving, onSave }) {
  function updateField(key, value) {
    setProfileForm((current) => ({ ...current, [key]: value }));
  }

  function updateMeasurement(key, value) {
    setProfileForm((current) => ({
      ...current,
      measurements: {
        ...current.measurements,
        [key]: value,
      },
    }));
  }

  return (
    <div className="space-y-4">
      <Panel className="space-y-4 p-4">
        <SectionHeader
          icon={<RulerIcon className="h-5 w-5" />}
          title="Osnovni podaci"
          subtitle="Ovo se unosi retko. Dovoljno je kada se nešto promeni."
        />

        <div className="grid grid-cols-2 gap-2">
          <InputBox label="Visina" suffix="cm" value={profileForm.heightCm} onChange={(value) => updateField("heightCm", value)} />
          <InputBox label="Težina" suffix="kg" value={profileForm.weightKg} onChange={(value) => updateField("weightKg", value)} />
          <InputBox label="Godine" suffix="" value={profileForm.age} onChange={(value) => updateField("age", value)} />
          <label className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="block text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-500">
              Pol
            </span>
            <select
              value={profileForm.sex}
              onChange={(event) => updateField("sex", event.target.value)}
              className="mt-1 w-full bg-transparent text-sm font-semibold text-white outline-none"
            >
              <option value="" className="bg-neutral-900">Nije uneto</option>
              <option value="male" className="bg-neutral-900">Muški</option>
              <option value="female" className="bg-neutral-900">Ženski</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Metric label="BMI" value={bodyStats.bmi ? formatNumber(bodyStats.bmi) : "-"} tone={getBmiTone(bodyStats.bmi)} />
          <Metric label="BMR" value={bodyStats.bmr ? `${Math.round(bodyStats.bmr)} kcal` : "-"} />
        </div>

        <InfoNote>
          BMI i BMR su smernice. Nisu presuda i imaju smisla tek uz cilj, trening i navike.
        </InfoNote>
      </Panel>

      <Panel className="space-y-4 p-4">
        <SectionHeader
          icon={<RulerIcon className="h-5 w-5" />}
          title="Mere tela"
          subtitle="Najbolje jednom mesečno ili kada trener proceni."
        />
        <div className="grid grid-cols-2 gap-2">
          {MEASUREMENT_FIELDS.map((field) => (
            <InputBox
              key={field.key}
              label={field.label}
              suffix="cm"
              value={profileForm.measurements?.[field.key] || ""}
              onChange={(value) => updateMeasurement(field.key, value)}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="w-full rounded-xl bg-brand-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-glow disabled:opacity-60"
        >
          {saving ? "Čuvanje..." : "Sačuvaj podatke"}
        </button>
      </Panel>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-brand-blue-500/25 bg-brand-blue-500/10 text-brand-blue-300">
        {icon}
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value, detail = "", tone = "neutral" }) {
  const toneClass = {
    neutral: "text-white",
    green: "text-brand-green-300",
    amber: "text-amber-200",
    red: "text-red-300",
  }[tone] || "text-white";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-500">
        {label}
      </p>
      <p className={`mt-1 truncate text-base font-semibold ${toneClass}`}>
        {value}
      </p>
      {detail && <p className="truncate text-[11px] text-neutral-400">{detail}</p>}
    </div>
  );
}

function InputBox({ label, suffix, value, onChange }) {
  return (
    <label className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <span className="block text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-500">
        {label}
      </span>
      <span className="mt-1 flex items-center gap-1">
        <input
          type="number"
          min="0"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-neutral-600"
          placeholder="-"
        />
        {suffix && <span className="text-xs text-neutral-500">{suffix}</span>}
      </span>
    </label>
  );
}

function InfoNote({ children }) {
  return (
    <p className="rounded-xl border border-brand-blue-500/15 bg-brand-blue-500/10 px-3 py-3 text-xs leading-relaxed text-brand-blue-100">
      {children}
    </p>
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

function Milestone({ title, detail, complete }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 ${
        complete
          ? "border-brand-green-500/20 bg-brand-green-500/10"
          : "border-white/10 bg-white/5"
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-white">{title}</span>
        <span className="block truncate text-xs text-neutral-400">{detail}</span>
      </span>
      <StatusPill tone={complete ? "green" : "neutral"}>
        {complete ? "gotovo" : "u toku"}
      </StatusPill>
    </div>
  );
}
