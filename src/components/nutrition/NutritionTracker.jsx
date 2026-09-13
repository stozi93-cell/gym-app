import { useEffect, useMemo, useState } from "react";
import { Panel } from "../ui/Primitives";
import {
  FOOD_SORT_OPTIONS,
  MEAL_TYPES,
  NUTRIENT_FIELDS,
  STARTER_FOODS,
  emptyFoodForm,
  foodNutrients,
  normalizeFoodForm,
  sumMeals,
  sumNutrients,
} from "../../data/nutritionCatalog";

const NUTRITION_HABITS = [
  { key: "protein", label: "Proteini" },
  { key: "water", label: "Voda" },
  { key: "plants", label: "Voće/povrće" },
  { key: "control", label: "Bez prejedanja" },
];

const VIEW_OPTIONS = [
  { value: "today", label: "Danas" },
  { value: "foods", label: "Namirnice" },
  { value: "trainer", label: "Obroci trenera" },
];

export default function NutritionTracker({
  todayLog,
  personalFoods = [],
  trainerMeals = [],
  saving,
  savingFood,
  onSave,
  onCreateFood,
}) {
  const [activeView, setActiveView] = useState("today");
  const [composerOpen, setComposerOpen] = useState(false);
  const [sessionFoods, setSessionFoods] = useState([]);
  const meals = safeMeals(todayLog.nutritionMeals);

  const foods = useMemo(() => {
    const merged = [...STARTER_FOODS, ...personalFoods, ...sessionFoods];
    const byName = new Map();
    merged.forEach((food) => {
      if (!food?.name) return;
      byName.set(food.name.trim().toLocaleLowerCase("sr-Latn-RS"), food);
    });
    return [...byName.values()];
  }, [personalFoods, sessionFoods]);

  async function saveMeals(nextMeals) {
    return onSave({ nutritionMeals: nextMeals });
  }

  async function addMeal(meal) {
    const saved = await saveMeals([...meals, meal]);
    if (saved) setComposerOpen(false);
    return saved;
  }

  async function removeMeal(mealId) {
    await saveMeals(meals.filter((meal) => meal.id !== mealId));
  }

  async function createFood(form) {
    const created = await onCreateFood(normalizeFoodForm(form));
    if (created) setSessionFoods((current) => [...current, created]);
    return created;
  }

  function startFoodMeal(food) {
    window.sessionStorage.setItem("nutritionPendingFood", food.id);
    setComposerOpen(true);
    setActiveView("today");
    window.setTimeout(() => {
      document.getElementById("nutrition-meal-composer")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-neutral-950/55 p-1">
        {VIEW_OPTIONS.map((view) => (
          <button
            key={view.value}
            type="button"
            onClick={() => {
              setActiveView(view.value);
              if (view.value !== "today") setComposerOpen(false);
            }}
            className={`min-h-9 rounded-lg px-1.5 py-2 text-[11px] font-medium transition ${
              activeView === view.value
                ? "bg-white/10 text-white"
                : "text-neutral-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {view.label}
          </button>
        ))}
      </div>

      {activeView === "today" && (
        <TodayView
          todayLog={todayLog}
          meals={meals}
          foods={foods}
          saving={saving}
          savingFood={savingFood}
          composerOpen={composerOpen}
          onOpenComposer={() => setComposerOpen(true)}
          onCloseComposer={() => setComposerOpen(false)}
          onAddMeal={addMeal}
          onRemoveMeal={removeMeal}
          onToggleHabit={(key) => onSave({ [key]: !todayLog[key] })}
          onCreateFood={createFood}
        />
      )}

      {activeView === "foods" && (
        <FoodCatalogView
          foods={foods}
          savingFood={savingFood}
          onCreateFood={createFood}
          onStartMeal={startFoodMeal}
        />
      )}

      {activeView === "trainer" && (
        <TrainerMealsView
          meals={trainerMeals}
          saving={saving}
          onAddMeal={addMeal}
        />
      )}
    </div>
  );
}

function TodayView({
  todayLog,
  meals,
  foods,
  saving,
  savingFood,
  composerOpen,
  onOpenComposer,
  onCloseComposer,
  onAddMeal,
  onRemoveMeal,
  onToggleHabit,
  onCreateFood,
}) {
  const totals = sumMeals(meals);

  if (composerOpen) {
    return (
      <MealComposer
        foods={foods}
        saving={saving}
        savingFood={savingFood}
        onCancel={onCloseComposer}
        onSave={onAddMeal}
        onCreateFood={onCreateFood}
      />
    );
  }

  return (
    <div className="space-y-3">
      <Panel className="p-3">
        <div className="grid grid-cols-4 gap-1.5">
          <DailyMetric label="Kalorije" value={round(totals.calories)} unit="kcal" primary />
          <DailyMetric label="Proteini" value={round(totals.protein, 1)} unit="g" />
          <DailyMetric label="UH" value={round(totals.carbs, 1)} unit="g" />
          <DailyMetric label="Masti" value={round(totals.fat, 1)} unit="g" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-white/10 pt-3">
          {NUTRITION_HABITS.map((habit) => (
            <button
              key={habit.key}
              type="button"
              disabled={saving}
              onClick={() => onToggleHabit(habit.key)}
              className={`flex min-h-8 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition disabled:opacity-60 ${
                todayLog[habit.key]
                  ? "border-brand-green-500/25 bg-brand-green-500/10 text-brand-green-200"
                  : "border-white/10 bg-white/[0.03] text-neutral-400"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] ${
                  todayLog[habit.key]
                    ? "border-brand-green-400 bg-brand-green-500 text-white"
                    : "border-white/15"
                }`}
              >
                {todayLog[habit.key] ? "✓" : ""}
              </span>
              <span className="truncate">{habit.label}</span>
            </button>
          ))}
        </div>
      </Panel>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
          Današnji obroci
        </p>
        <button
          type="button"
          onClick={onOpenComposer}
          className="rounded-lg bg-brand-blue-500 px-3 py-1.5 text-xs font-semibold text-white shadow-glow"
        >
          + Dodaj obrok
        </button>
      </div>

      {meals.length ? (
        <div className="space-y-2">
          {meals.map((meal) => (
            <MealRow
              key={meal.id}
              meal={meal}
              saving={saving}
              onRemove={() => onRemoveMeal(meal.id)}
            />
          ))}
        </div>
      ) : (
        <Panel className="px-4 py-5 text-center text-sm text-neutral-400">
          Danas još nema upisanih obroka.
        </Panel>
      )}
    </div>
  );
}

function MealComposer({ foods, saving, savingFood, onCancel, onSave, onCreateFood }) {
  const pendingFoodId = window.sessionStorage.getItem("nutritionPendingFood");
  const pendingFood = foods.find((food) => food.id === pendingFoodId);
  const [mealType, setMealType] = useState("breakfast");
  const [selectedItems, setSelectedItems] = useState(() =>
    pendingFood ? [createMealItem(pendingFood)] : []
  );
  const [search, setSearch] = useState("");
  const [showCustomFood, setShowCustomFood] = useState(false);

  useEffect(() => {
    window.sessionStorage.removeItem("nutritionPendingFood");
  }, []);

  const visibleFoods = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("sr-Latn-RS");
    return foods
      .filter((food) => !term || food.name.toLocaleLowerCase("sr-Latn-RS").includes(term))
      .slice(0, 8);
  }, [foods, search]);

  const totals = sumNutrients(selectedItems);

  function addFood(food) {
    setSelectedItems((current) => {
      const existing = current.find((item) => item.foodId === food.id);
      if (existing) {
        return current.map((item) =>
          item.foodId === food.id ? { ...item, grams: item.grams + 100 } : item
        );
      }
      return [...current, createMealItem(food)];
    });
  }

  function updateGrams(foodId, grams) {
    setSelectedItems((current) =>
      current.map((item) =>
        item.foodId === foodId ? { ...item, grams: Math.max(0, Number(grams) || 0) } : item
      )
    );
  }

  async function saveCustomFood(form) {
    const created = await onCreateFood(form);
    if (created) {
      addFood(created);
      setShowCustomFood(false);
    }
  }

  function submitMeal() {
    const items = selectedItems.filter((item) => item.grams > 0);
    if (!items.length) return;
    onSave({
      id: createId("meal"),
      type: mealType,
      name: getMealTypeLabel(mealType),
      items,
      createdAt: new Date().toISOString(),
      source: "client",
    });
  }

  return (
    <Panel id="nutrition-meal-composer" className="p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">Novi obrok</p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300"
        >
          Otkaži
        </button>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-neutral-950/55 p-1">
        {MEAL_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => setMealType(type.value)}
            className={`rounded-lg px-1 py-2 text-[10px] font-medium transition ${
              mealType === type.value
                ? "bg-brand-blue-500 text-white"
                : "text-neutral-400 hover:bg-white/5"
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      {selectedItems.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
          {selectedItems.map((item) => (
            <div key={item.foodId} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">
                {item.name}
              </span>
              <input
                type="number"
                min="0"
                step="10"
                value={item.grams}
                onChange={(event) => updateGrams(item.foodId, event.target.value)}
                aria-label={`Grami za ${item.name}`}
                className="w-16 rounded-md border border-white/10 bg-neutral-950/70 px-1.5 py-1 text-right text-xs text-white outline-none focus:border-brand-blue-500"
              />
              <span className="text-[10px] text-neutral-500">g</span>
              <span className="w-12 text-right text-[10px] text-neutral-300">
                {round((Number(item.nutrients.calories) || 0) * item.grams / 100)} kcal
              </span>
              <button
                type="button"
                onClick={() => setSelectedItems((current) => current.filter((entry) => entry.foodId !== item.foodId))}
                aria-label={`Ukloni ${item.name}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-red-500/10 hover:text-red-300"
              >
                ×
              </button>
            </div>
          ))}
          <p className="text-right text-xs font-semibold text-white">
            {round(totals.calories)} kcal
          </p>
        </div>
      )}

      <label className="relative mt-3 block">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Pretraži namirnice"
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-brand-blue-500"
        />
      </label>

      <div className="mt-2 max-h-60 divide-y divide-white/[0.06] overflow-y-auto rounded-xl border border-white/10 bg-neutral-950/35">
        {visibleFoods.map((food) => (
          <button
            key={food.id}
            type="button"
            onClick={() => addFood(food)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-white/5"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-white">{food.name}</span>
              <span className="block text-[10px] text-neutral-500">
                {round(food.calories)} kcal · P {round(food.protein, 1)} · UH {round(food.carbs, 1)} · M {round(food.fat, 1)}
              </span>
            </span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-blue-500/15 text-base text-brand-blue-300">
              +
            </span>
          </button>
        ))}
        {!visibleFoods.length && (
          <p className="px-3 py-4 text-center text-xs text-neutral-500">Nema rezultata.</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowCustomFood((current) => !current)}
        className="mt-2 text-xs font-medium text-brand-blue-300"
      >
        {showCustomFood ? "Zatvori unos" : "+ Dodaj novu namirnicu"}
      </button>

      {showCustomFood && (
        <CustomFoodForm saving={savingFood} onSave={saveCustomFood} />
      )}

      <button
        type="button"
        disabled={saving || !selectedItems.some((item) => item.grams > 0)}
        onClick={submitMeal}
        className="mt-3 w-full rounded-xl bg-brand-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-glow disabled:opacity-40"
      >
        {saving ? "Čuvanje..." : "Upiši obrok"}
      </button>
    </Panel>
  );
}

function FoodCatalogView({ foods, savingFood, onCreateFood, onStartMeal }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [showCustomFood, setShowCustomFood] = useState(false);
  const [expandedFoodId, setExpandedFoodId] = useState(null);

  const visibleFoods = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("sr-Latn-RS");
    return foods
      .filter((food) => !term || food.name.toLocaleLowerCase("sr-Latn-RS").includes(term))
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name, "sr-Latn-RS");
        const aValue = a[sortBy];
        const bValue = b[sortBy];
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;
        return Number(bValue) - Number(aValue);
      });
  }, [foods, search, sortBy]);

  return (
    <div className="space-y-3">
      <Panel className="p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
          <label className="relative block">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pretraga"
              className="w-full rounded-xl border border-white/10 bg-neutral-950/60 py-2.5 pl-9 pr-2 text-xs text-white outline-none placeholder:text-neutral-600 focus:border-brand-blue-500"
            />
          </label>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            aria-label="Sortiranje namirnica"
            className="min-w-0 rounded-xl border border-white/10 bg-neutral-950/60 px-2 py-2.5 text-xs text-white outline-none focus:border-brand-blue-500"
          >
            {FOOD_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[10px] text-neutral-500">Vrednosti su na 100 g.</p>
          <button
            type="button"
            onClick={() => setShowCustomFood((current) => !current)}
            className="text-xs font-medium text-brand-blue-300"
          >
            {showCustomFood ? "Zatvori" : "+ Nova namirnica"}
          </button>
        </div>

        {showCustomFood && (
          <CustomFoodForm saving={savingFood} onSave={async (form) => {
            const created = await onCreateFood(form);
            if (created) setShowCustomFood(false);
          }} />
        )}
      </Panel>

      <div className="space-y-2">
        {visibleFoods.map((food) => {
          const expanded = expandedFoodId === food.id;
          return (
            <div key={food.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedFoodId(expanded ? null : food.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-semibold text-white">{food.name}</span>
                  <span className="mt-1 grid grid-cols-4 gap-1 text-[10px] text-neutral-400">
                    <span>{round(food.calories)} kcal</span>
                    <span>P {round(food.protein, 1)}g</span>
                    <span>UH {round(food.carbs, 1)}g</span>
                    <span>M {round(food.fat, 1)}g</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onStartMeal(food)}
                  aria-label={`Dodaj ${food.name} u obrok`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue-500/15 text-lg text-brand-blue-300"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={() => setExpandedFoodId(expanded ? null : food.id)}
                className="mt-2 flex w-full items-center justify-between border-t border-white/[0.07] pt-2 text-[10px] text-neutral-500"
              >
                <span>Vlakna {display(food.fiber, "g")} · Šećeri {display(food.sugar, "g")} · GI {display(food.glycemicIndex)}</span>
                <ChevronIcon className={`h-3.5 w-3.5 transition ${expanded ? "rotate-180" : ""}`} />
              </button>

              {expanded && (
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  <NutrientCell label="Natrijum" value={display(food.sodium, "mg")} />
                  <NutrientCell label="Kalijum" value={display(food.potassium, "mg")} />
                  <NutrientCell label="Kalcijum" value={display(food.calcium, "mg")} />
                  <NutrientCell label="Gvožđe" value={display(food.iron, "mg")} />
                  <p className="col-span-4 mt-1 text-[9px] text-neutral-600">
                    {food.catalogStatus === "personal" ? "Lični unos" : food.source}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrainerMealsView({ meals, saving, onAddMeal }) {
  if (!meals.length) {
    return (
      <Panel className="px-4 py-7 text-center">
        <p className="text-sm font-medium text-white">Trener još nije dodao obroke.</p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
          Ovde će se pojaviti gotovi obroci koje trener pripremi.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-2">
      {meals.map((template) => {
        const totals = sumNutrients(template.items);
        return (
          <div key={template.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{template.name}</p>
                <p className="mt-0.5 text-[10px] text-neutral-500">
                  {round(totals.calories)} kcal · P {round(totals.protein, 1)}g · UH {round(totals.carbs, 1)}g · M {round(totals.fat, 1)}g
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => onAddMeal({
                  ...template,
                  id: createId("meal"),
                  templateId: template.id,
                  createdAt: new Date().toISOString(),
                  source: "trainer",
                })}
                className="shrink-0 rounded-lg bg-brand-blue-500 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Dodaj
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CustomFoodForm({ saving, onSave }) {
  const [form, setForm] = useState(emptyFoodForm);
  const [error, setError] = useState("");

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (!form.name.trim()) {
      setError("Upiši naziv namirnice.");
      return;
    }
    setError("");
    await onSave(form);
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <input
        type="text"
        value={form.name}
        onChange={(event) => update("name", event.target.value)}
        placeholder="Naziv namirnice"
        className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-brand-blue-500"
      />
      <p className="mt-2 text-[10px] text-neutral-500">
        Unesi vrednosti sa deklaracije na 100 g. Prazna polja ostaju nepoznata.
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {NUTRIENT_FIELDS.map((field) => (
          <label key={field.key} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
            <span className="block truncate text-[9px] text-neutral-500">{field.label}</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                max={field.key === "glycemicIndex" ? "100" : undefined}
                step="0.1"
                value={form[field.key]}
                onChange={(event) => update(field.key, event.target.value)}
                className="min-w-0 flex-1 bg-transparent py-1 text-xs text-white outline-none"
              />
              <span className="text-[9px] text-neutral-600">{field.unit}</span>
            </span>
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      <button
        type="button"
        disabled={saving}
        onClick={submit}
        className="mt-2 w-full rounded-xl border border-brand-blue-500/30 bg-brand-blue-500/10 px-3 py-2 text-xs font-semibold text-brand-blue-200 disabled:opacity-50"
      >
        {saving ? "Čuvanje..." : "Sačuvaj namirnicu"}
      </button>
    </div>
  );
}

function MealRow({ meal, saving, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const totals = sumNutrients(meal.items);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setExpanded((current) => !current)} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">{meal.name || getMealTypeLabel(meal.type)}</span>
            <span className="text-xs font-semibold text-brand-blue-300">{round(totals.calories)} kcal</span>
          </span>
          <span className="mt-0.5 block text-[10px] text-neutral-500">
            P {round(totals.protein, 1)}g · UH {round(totals.carbs, 1)}g · M {round(totals.fat, 1)}g
          </span>
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onRemove}
          aria-label={`Ukloni ${meal.name || "obrok"}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-label={expanded ? "Sakrij stavke" : "Prikaži stavke"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500"
        >
          <ChevronIcon className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
      {expanded && (
        <div className="mt-2 divide-y divide-white/[0.06] border-t border-white/[0.07] pt-1">
          {meal.items.map((item) => (
            <div key={`${meal.id}-${item.foodId}`} className="flex items-center justify-between gap-3 py-1.5 text-[11px]">
              <span className="min-w-0 truncate text-neutral-300">{item.name}</span>
              <span className="shrink-0 text-neutral-500">{item.grams} g</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DailyMetric({ label, value, unit, primary = false }) {
  return (
    <div className={`rounded-lg px-2 py-2 text-center ${primary ? "bg-brand-blue-500/12" : "bg-white/[0.04]"}`}>
      <p className="truncate text-[9px] text-neutral-500">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-semibold ${primary ? "text-brand-blue-200" : "text-white"}`}>
        {value}<span className="ml-0.5 text-[9px] font-normal text-neutral-500">{unit}</span>
      </p>
    </div>
  );
}

function NutrientCell({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg bg-white/[0.035] px-1.5 py-1.5 text-center">
      <p className="truncate text-[9px] text-neutral-600">{label}</p>
      <p className="truncate text-[10px] font-medium text-neutral-300">{value}</p>
    </div>
  );
}

function createMealItem(food) {
  return {
    foodId: food.id,
    name: food.name,
    grams: 100,
    nutrients: foodNutrients(food),
  };
}

function safeMeals(value) {
  return Array.isArray(value) ? value.filter((meal) => Array.isArray(meal.items)) : [];
}

function getMealTypeLabel(value) {
  return MEAL_TYPES.find((type) => type.value === value)?.label || "Obrok";
}

function createId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}

function round(value, digits = 0) {
  return Number(value || 0).toLocaleString("sr-Latn-RS", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function display(value, unit = "") {
  if (value === null || value === undefined || value === "") return "—";
  return `${round(value, 1)}${unit}`;
}

function SearchIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function ChevronIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function TrashIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="m7 7 1 13h8l1-13" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}
