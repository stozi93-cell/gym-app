import { sumMeals } from "./nutritionCatalog.js";

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

export function buildNutritionHistory(logs = [], now = new Date()) {
  const today = startOfDay(now);
  const currentMonday = startOfDay(today);
  currentMonday.setDate(currentMonday.getDate() - ((currentMonday.getDay() + 6) % 7));
  const logsByDate = new Map(logs.map((log) => [log.dateKey, log]));

  const weeks = Array.from({ length: 4 }, (_, weekIndex) => {
    const monday = startOfDay(currentMonday);
    monday.setDate(monday.getDate() - weekIndex * 7);
    const days = Array.from({ length: 7 }, (_, dayIndex) => {
      const date = startOfDay(monday);
      date.setDate(date.getDate() + dayIndex);
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
      key: dateKey(monday),
      index: weekIndex,
      days,
      recordedDays: days.filter((day) => day.recorded).length,
      average: averageTotals(days),
    };
  });

  const visibleDays = weeks.flatMap((week) => week.days).filter((day) => !day.future);
  return {
    weeks,
    recordedDays: visibleDays.filter((day) => day.recorded).length,
    visibleDays: visibleDays.length,
    average: averageTotals(visibleDays),
    startDate: weeks[3].days[0].date,
    endDate: today,
  };
}
