import test from "node:test";
import assert from "node:assert/strict";
import { buildNutritionHistory } from "../src/data/nutritionHistory.js";

function meal(calories, protein = 0) {
  return {
    items: [{ grams: 100, nutrients: { calories, protein, carbs: 10, fat: 5 } }],
  };
}

test("groups four Monday-first weeks and averages only days with meals", () => {
  const logs = [
    { dateKey: "2026-09-16", nutritionMeals: [meal(200, 20)] },
    { dateKey: "2026-09-10", nutritionMeals: [meal(100, 10), meal(300, 30)] },
    { dateKey: "2026-08-24", nutritionMeals: [meal(200, 20)] },
    { dateKey: "2026-08-23", nutritionMeals: [meal(900, 90)] },
    { dateKey: "2026-09-15", nutritionMeals: [] },
  ];
  const history = buildNutritionHistory(logs, new Date(2026, 8, 16, 12));

  assert.deepEqual(history.weeks.map((week) => week.key), [
    "2026-09-14", "2026-09-07", "2026-08-31", "2026-08-24",
  ]);
  assert.equal(history.visibleDays, 24);
  assert.equal(history.endDate.getDate(), 20);
  assert.equal(history.recordedDays, 3);
  assert.equal(history.weeks[0].recordedDays, 1);
  assert.equal(history.weeks[0].average.calories, 200);
  assert.equal(history.weeks[1].average.calories, 400);
  assert.equal(history.weeks[2].average, null);
  assert.equal(history.weeks[0].days[6].future, true);
  assert.equal(history.weeks[0].days[6].recorded, false);
  assert.ok(Math.abs(history.average.calories - 800 / 3) < 0.001);
  assert.ok(Math.abs(history.average.protein - 80 / 3) < 0.001);
  assert.equal(logs[0].nutritionMeals.length, 1);
});

test("does not turn blank or malformed days into zero-calorie averages", () => {
  const history = buildNutritionHistory(
    [{ dateKey: "2026-09-16", nutritionMeals: {} }],
    new Date(2026, 8, 16, 12)
  );

  assert.equal(history.recordedDays, 0);
  assert.equal(history.average, null);
  assert.equal(history.weeks[0].average, null);
});

test("handles weeks crossing a calendar year", () => {
  const history = buildNutritionHistory([], new Date(2026, 0, 1, 12));

  assert.equal(history.weeks[0].key, "2025-12-29");
  assert.equal(history.endDate.getDate(), 4);
});

test("four complete calendar weeks contain 28 elapsed days on Sunday", () => {
  const history = buildNutritionHistory([], new Date(2026, 8, 20, 12));

  assert.equal(history.visibleDays, 28);
  assert.equal(history.weeks[0].days[6].future, false);
});
