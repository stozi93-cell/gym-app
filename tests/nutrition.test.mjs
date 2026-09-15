import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFoodForm,
  scaleNutrients,
  sortMealsByTime,
  sumMeals,
  sumNutrients,
} from "../src/data/nutritionCatalog.js";

test("scales nutrient values from 100 g to the entered amount", () => {
  const values = scaleNutrients(
    { calories: 200, protein: 10, carbs: 20, fat: 5 },
    150
  );

  assert.equal(values.calories, 300);
  assert.equal(values.protein, 15);
  assert.equal(values.carbs, 30);
  assert.equal(values.fat, 7.5);
});

test("totals foods inside meals and across a day", () => {
  const item = {
    grams: 50,
    nutrients: { calories: 200, protein: 10, carbs: 20, fat: 5 },
  };
  const mealTotals = sumNutrients([item, item]);
  const dayTotals = sumMeals([{ items: [item] }, { items: [item] }]);

  assert.equal(mealTotals.calories, 200);
  assert.equal(mealTotals.protein, 10);
  assert.deepEqual(dayTotals, mealTotals);
});

test("calculates missing calories from macros and constrains GI", () => {
  const food = normalizeFoodForm({
    name: " Test namirnica ",
    calories: "",
    protein: "10",
    carbs: "20",
    fat: "5",
    fiber: "",
    sugar: "",
    sodium: "",
    potassium: "",
    calcium: "",
    iron: "",
    glycemicIndex: "120",
  });

  assert.equal(food.name, "Test namirnica");
  assert.equal(food.calories, 165);
  assert.equal(food.glycemicIndex, 100);
});

test("shows late-recorded meals by stated time without changing older entries", () => {
  const meals = [
    { id: "old", items: [] },
    { id: "dinner", eatenAt: "19:30", items: [] },
    { id: "breakfast", eatenAt: "08:00", items: [] },
  ];

  assert.deepEqual(sortMealsByTime(meals).map((meal) => meal.id), [
    "breakfast",
    "dinner",
    "old",
  ]);
  assert.equal(meals[0].id, "old");
});
