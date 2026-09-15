export const MEAL_TYPES = [
  { value: "breakfast", label: "Doručak" },
  { value: "lunch", label: "Ručak" },
  { value: "dinner", label: "Večera" },
  { value: "snack", label: "Užina" },
];

export const NUTRIENT_FIELDS = [
  { key: "calories", label: "Kalorije", shortLabel: "kcal", unit: "kcal" },
  { key: "protein", label: "Proteini", shortLabel: "P", unit: "g" },
  { key: "carbs", label: "Ugljeni hidrati", shortLabel: "UH", unit: "g" },
  { key: "fat", label: "Masti", shortLabel: "M", unit: "g" },
  { key: "fiber", label: "Vlakna", shortLabel: "Vlakna", unit: "g" },
  { key: "sugar", label: "Šećeri", shortLabel: "Šećeri", unit: "g" },
  { key: "sodium", label: "Natrijum", shortLabel: "Na", unit: "mg" },
  { key: "potassium", label: "Kalijum", shortLabel: "K", unit: "mg" },
  { key: "calcium", label: "Kalcijum", shortLabel: "Ca", unit: "mg" },
  { key: "iron", label: "Gvožđe", shortLabel: "Fe", unit: "mg" },
  { key: "glycemicIndex", label: "Glikemijski indeks", shortLabel: "GI", unit: "" },
];

export const FOOD_SORT_OPTIONS = [
  { value: "name", label: "Naziv" },
  ...NUTRIENT_FIELDS.map((field) => ({ value: field.key, label: field.label })),
];

// Average values per 100 g. Product labels should take priority for branded foods.
export const STARTER_FOODS = [
  food("chicken-breast", "Pileća prsa, pečena", 165, 31, 0, 3.6, 0, 0, 74, 256, 15, 1, null),
  food("egg-boiled", "Jaje, kuvano", 155, 12.6, 1.1, 10.6, 0, 1.1, 124, 126, 50, 1.2, null),
  food("tuna-water", "Tunjevina u vodi", 116, 25.5, 0, 0.8, 0, 0, 247, 237, 11, 1.3, null),
  food("cottage-cheese", "Posni sir", 72, 12.4, 2.7, 1, 0, 2.7, 406, 86, 61, 0.1, null),
  food("greek-yogurt", "Grčki jogurt 2%", 73, 10, 3.9, 2, 0, 3.6, 34, 141, 115, 0.1, null),
  food("milk-2", "Mleko 2%", 50, 3.3, 4.8, 2, 0, 5, 44, 150, 120, 0, 27),
  food("oats", "Ovsene pahuljice", 379, 13.2, 67.7, 6.5, 10.1, 1, 6, 362, 52, 4.3, 55),
  food("rice-white", "Beli pirinač, kuvan", 130, 2.7, 28.2, 0.3, 0.4, 0.1, 1, 35, 10, 0.2, 73),
  food("potato-boiled", "Krompir, kuvan", 87, 1.9, 20.1, 0.1, 1.8, 0.9, 4, 379, 5, 0.3, 78),
  food("bread-wholegrain", "Integralni hleb", 247, 13, 41, 3.4, 7, 6, 400, 230, 107, 2.4, 54),
  food("lentils-cooked", "Sočivo, kuvano", 116, 9, 20.1, 0.4, 7.9, 1.8, 2, 369, 19, 3.3, 32),
  food("banana", "Banana", 89, 1.1, 22.8, 0.3, 2.6, 12.2, 1, 358, 5, 0.3, 51),
  food("apple", "Jabuka", 52, 0.3, 13.8, 0.2, 2.4, 10.4, 1, 107, 6, 0.1, 36),
  food("broccoli", "Brokoli, kuvan", 35, 2.4, 7.2, 0.4, 3.3, 1.4, 41, 293, 40, 0.7, 15),
  food("almonds", "Badem", 579, 21.2, 21.6, 49.9, 12.5, 4.4, 1, 733, 269, 3.7, 15),
  food("olive-oil", "Maslinovo ulje", 884, 0, 0, 100, 0, 0, 2, 1, 1, 0.6, null),
];

function food(
  id,
  name,
  calories,
  protein,
  carbs,
  fat,
  fiber,
  sugar,
  sodium,
  potassium,
  calcium,
  iron,
  glycemicIndex
) {
  return {
    id,
    name,
    calories,
    protein,
    carbs,
    fat,
    fiber,
    sugar,
    sodium,
    potassium,
    calcium,
    iron,
    glycemicIndex,
    source: "Prosečna vrednost; proveriti deklaraciju",
    catalogStatus: "starter",
  };
}

export function emptyFoodForm() {
  return {
    name: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    fiber: "",
    sugar: "",
    sodium: "",
    potassium: "",
    calcium: "",
    iron: "",
    glycemicIndex: "",
  };
}

export function normalizeFoodForm(form) {
  const normalized = { name: form.name.trim() };
  NUTRIENT_FIELDS.forEach(({ key }) => {
    normalized[key] = form[key] === "" ? null : Math.max(0, Number(form[key]) || 0);
  });

  if (normalized.calories === null) {
    normalized.calories = Math.round(
      (normalized.protein || 0) * 4 +
        (normalized.carbs || 0) * 4 +
        (normalized.fat || 0) * 9
    );
  }
  if (normalized.glycemicIndex !== null) {
    normalized.glycemicIndex = Math.min(100, normalized.glycemicIndex);
  }
  return normalized;
}

export function foodNutrients(foodItem) {
  return Object.fromEntries(
    NUTRIENT_FIELDS.map(({ key }) => [key, foodItem[key] ?? null])
  );
}

export function scaleNutrients(nutrients = {}, grams = 0) {
  const factor = Math.max(0, Number(grams) || 0) / 100;
  return Object.fromEntries(
    NUTRIENT_FIELDS.filter(({ key }) => key !== "glycemicIndex").map(({ key }) => [
      key,
      (Number(nutrients[key]) || 0) * factor,
    ])
  );
}

export function sumNutrients(items = []) {
  return items.reduce(
    (totals, item) => {
      const values = scaleNutrients(item.nutrients, item.grams);
      Object.keys(totals).forEach((key) => {
        totals[key] += values[key] || 0;
      });
      return totals;
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
      potassium: 0,
      calcium: 0,
      iron: 0,
    }
  );
}

export function sumMeals(meals = []) {
  return meals.reduce(
    (totals, meal) => {
      const mealTotals = sumNutrients(meal.items);
      Object.keys(totals).forEach((key) => {
        totals[key] += mealTotals[key] || 0;
      });
      return totals;
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
      potassium: 0,
      calcium: 0,
      iron: 0,
    }
  );
}

export function sortMealsByTime(meals = []) {
  function validTime(value) {
    if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [hours, minutes] = value.split(":").map(Number);
    return hours < 24 && minutes < 60 ? value : null;
  }

  return [...meals].sort((a, b) => {
    const aTime = validTime(a.eatenAt);
    const bTime = validTime(b.eatenAt);
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return aTime.localeCompare(bTime);
  });
}
