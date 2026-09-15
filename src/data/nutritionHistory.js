import { sumMeals } from "./nutritionCatalog.js";
import { addDays, differenceInCalendarDays } from "date-fns";

const NUTRIENT_KEYS = ["calories", "protein", "carbs", "fat"];

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateKey(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function averageTotals(days) {
  const recorded = days.filter((day) => day.recorded);
  if (!recorded.length) return null;
  return Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [
      key,
      recorded.reduce((total, day) => total + day.totals[key], 0) / recorded.length,
    ])
  );
}

export function buildNutritionHistory(logs = [], now = new Date(), membership = null) {
  const today = startOfDay(now);
  const currentMonday = startOfDay(today);
  currentMonday.setDate(currentMonday.getDate() - ((currentMonday.getDay() + 6) % 7));
  const logsByDate = new Map(logs.map((log) => [log.dateKey, log]));
  const membershipStart = membership?.startDate
    ? startOfDay(membership.startDate.toDate?.() || membership.startDate)
    : null;
  const membershipEnd = membership?.endDate
    ? startOfDay(membership.endDate.toDate?.() || membership.endDate)
    : null;
  const currentMembershipWeek = membershipStart
    ? Math.floor(differenceInCalendarDays(today, membershipStart) / 7)
    : null;

  const weekSpecs = membershipStart && membershipEnd && currentMembershipWeek >= 0
    ? Array.from({ length: Math.min(4, currentMembershipWeek + 1) }, (_, index) => {
      const weekNumber = currentMembershipWeek - index;
      const start = addDays(membershipStart, weekNumber * 7);
      return {
        start,
        length: Math.max(0, Math.min(7, differenceInCalendarDays(membershipEnd, start) + 1)),
        index,
        subscriptionWeek: weekNumber + 1,
      };
    }).filter((week) => week.length > 0)
    : Array.from({ length: 4 }, (_, index) => ({
      start: addDays(currentMonday, -index * 7), length: 7, index,
    }));

  const weeks = weekSpecs.map(({ start, length, index, subscriptionWeek }) => {
    const days = Array.from({ length }, (_, dayIndex) => {
      const date = addDays(start, dayIndex);
      const key = dateKey(date);
      const savedMeals = logsByDate.get(key)?.nutritionMeals;
      const meals = (Array.isArray(savedMeals) ? savedMeals : []).filter(
        (meal) => Array.isArray(meal.items)
      );
      const future = date > today;
      return {
        key,
        date,
        meals: future ? [] : meals,
        totals: sumMeals(future ? [] : meals),
        recorded: !future && meals.length > 0,
        future,
      };
    });

    return {
      key: dateKey(start),
      index,
      subscriptionWeek,
      days,
      recordedDays: days.filter((day) => day.recorded).length,
      average: averageTotals(days),
    };
  });

  const visibleDays = weeks.flatMap((week) => week.days).filter((day) => !day.future);
  const startDate = weeks.at(-1).days[0].date;
  const fullPeriodEnd = addDays(startDate, 27);
  const endDate = membershipEnd && membershipEnd < fullPeriodEnd
    ? membershipEnd
    : fullPeriodEnd;
  return {
    weeks,
    recordedDays: visibleDays.filter((day) => day.recorded).length,
    visibleDays: visibleDays.length,
    average: averageTotals(visibleDays),
    startDate,
    endDate,
    periodDays: differenceInCalendarDays(endDate, startDate) + 1,
  };
}
