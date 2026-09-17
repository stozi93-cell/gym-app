import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { EmptyState, Panel, StatusPill } from "../components/ui/Primitives";
import ScrollArea from "../components/ui/ScrollArea";
import {
  EXERCISE_CATEGORIES,
  EXERCISE_EQUIPMENT,
  EXERCISES,
  getExerciseById,
} from "../data/exerciseCatalog";

const TRAINING_STORAGE_KEY = "remotion-training-templates-v1";
const PROGRAM_STORAGE_KEY = "remotion-program-templates-v1";
const SCHEDULE_STORAGE_KEY = "remotion-training-schedule-v1";

const DEMO_TRAININGS = [
  {
    id: "trainer-example-full-body",
    name: "Celo telo · primer",
    focus: "Opšta priprema",
    source: "trainer",
    demo: true,
    exercises: [
      { exerciseId: "back-squat", sets: 3, reps: "8", restSeconds: 90 },
      { exerciseId: "bench-press", sets: 3, reps: "8-10", restSeconds: 90 },
      { exerciseId: "seated-row", sets: 3, reps: "10-12", restSeconds: 75 },
    ],
  },
  {
    id: "trainer-example-core",
    name: "Stabilnost trupa · primer",
    focus: "Mobilnost",
    source: "trainer",
    demo: true,
    exercises: [
      { exerciseId: "dead-bug", sets: 3, reps: "8/strana", restSeconds: 45 },
      { exerciseId: "plank", sets: 3, reps: "30 s", restSeconds: 45 },
      { exerciseId: "face-pull", sets: 3, reps: "12-15", restSeconds: 60 },
    ],
  },
];

const DEMO_PROGRAMS = [{
  id: "trainer-example-program",
  name: "Povratak treningu · primer",
  goal: "Povratak treningu",
  weeks: 4,
  trainingIds: DEMO_TRAININGS.map((item) => item.id),
  source: "trainer",
  demo: true,
}];

const COACH_TABS = [
  { value: "exercises", label: "Vežbe" },
  { value: "trainings", label: "Treninzi" },
  { value: "programs", label: "Programi" },
];

function createId(prefix) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() || Date.now()}`;
}

function readStoredTemplates(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function useStoredTemplates(key) {
  const [items, setItems] = useState(() => readStoredTemplates(key));

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(items));
  }, [items, key]);

  return [items, setItems];
}

function emptyTrainingDraft() {
  return { name: "", focus: "Opšta priprema", exercises: [] };
}

function emptyProgramDraft() {
  return { name: "", goal: "Opšta kondicija", weeks: 4, trainingIds: [] };
}

export default function ExerciseLibrary() {
  const { profile, user } = useAuth();
  const coachMode = profile?.role === "admin";
  const [activeTab, setActiveTab] = useState("exercises");
  const [trainingView, setTrainingView] = useState("today");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [trainingDraft, setTrainingDraft] = useState(emptyTrainingDraft);
  const [programDraft, setProgramDraft] = useState(emptyProgramDraft);
  const storageOwner = user?.uid || "anonymous";
  const [trainingTemplates, setTrainingTemplates] = useStoredTemplates(`${TRAINING_STORAGE_KEY}:${storageOwner}`);
  const [programTemplates, setProgramTemplates] = useStoredTemplates(`${PROGRAM_STORAGE_KEY}:${storageOwner}`);
  const [scheduledTrainings, setScheduledTrainings] = useStoredTemplates(`${SCHEDULE_STORAGE_KEY}:${storageOwner}`);
  const [status, setStatus] = useState("");
  const visibleTrainingTemplates = useMemo(
    () => [...DEMO_TRAININGS, ...trainingTemplates],
    [trainingTemplates]
  );
  const visibleProgramTemplates = useMemo(
    () => [...DEMO_PROGRAMS, ...programTemplates],
    [programTemplates]
  );

  const filteredExercises = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("sr-Latn-RS");
    return EXERCISES.filter((exercise) => {
      const matchesSearch = !normalizedSearch || [
        exercise.name,
        ...exercise.primaryMuscles,
        ...exercise.secondaryMuscles,
      ].some((value) => value.toLocaleLowerCase("sr-Latn-RS").includes(normalizedSearch));
      const matchesCategory = category === "all" || exercise.category === category;
      const matchesEquipment = equipment === "all" || exercise.equipment === equipment;
      return matchesSearch && matchesCategory && matchesEquipment;
    });
  }, [category, equipment, search]);

  function showStatus(message) {
    setStatus(message);
    window.setTimeout(() => setStatus(""), 2600);
  }

  function addExercise(exercise) {
    setTrainingDraft((current) => {
      if (current.exercises.some((item) => item.exerciseId === exercise.id)) return current;
      return {
        ...current,
        exercises: [
          ...current.exercises,
          { exerciseId: exercise.id, sets: 3, reps: "8-10", restSeconds: 90 },
        ],
      };
    });
    showStatus(`${exercise.name} je dodata u nacrt.`);
  }

  function updateDraftExercise(index, patch) {
    setTrainingDraft((current) => ({
      ...current,
      exercises: current.exercises.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }));
  }

  function moveDraftExercise(index, direction) {
    setTrainingDraft((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.exercises.length) return current;
      const exercises = [...current.exercises];
      [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
      return { ...current, exercises };
    });
  }

  function saveTrainingTemplate() {
    const name = trainingDraft.name.trim();
    if (!name || trainingDraft.exercises.length === 0) {
      showStatus("Unesi naziv i dodaj bar jednu vežbu.");
      return;
    }

    const template = {
      ...trainingDraft,
      id: createId("training"),
      name,
      createdAt: new Date().toISOString(),
      source: coachMode ? "trainer" : "client",
    };
    setTrainingTemplates((current) => [template, ...current]);
    setTrainingDraft(emptyTrainingDraft());
    showStatus("Trening je sačuvan kao lokalni nacrt.");
  }

  function toggleProgramTraining(trainingId) {
    setProgramDraft((current) => ({
      ...current,
      trainingIds: current.trainingIds.includes(trainingId)
        ? current.trainingIds.filter((id) => id !== trainingId)
        : [...current.trainingIds, trainingId],
    }));
  }

  function saveProgramTemplate() {
    const name = programDraft.name.trim();
    if (!name || programDraft.trainingIds.length === 0) {
      showStatus("Unesi naziv i izaberi bar jedan trening.");
      return;
    }

    setProgramTemplates((current) => [{
      ...programDraft,
      id: createId("program"),
      name,
      weeks: Number(programDraft.weeks),
      createdAt: new Date().toISOString(),
      source: coachMode ? "trainer" : "client",
    }, ...current]);
    setProgramDraft(emptyProgramDraft());
    showStatus("Program je sačuvan kao lokalni nacrt.");
  }

  return (
    <div className="mx-auto max-w-md space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-neutral-950/70 p-1">
          {COACH_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`rounded-lg px-2 py-2 text-xs font-medium transition ${
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
        <div className="rounded-xl border border-brand-blue-500/20 bg-brand-blue-500/10 px-3 py-2 text-xs text-brand-blue-100">
          {status}
        </div>
      )}

      {activeTab === "exercises" && (
        <ExerciseBrowser
          canBuild
          search={search}
          setSearch={setSearch}
          category={category}
          setCategory={setCategory}
          equipment={equipment}
          setEquipment={setEquipment}
          exercises={filteredExercises}
          draftCount={trainingDraft.exercises.length}
          onOpen={setSelectedExercise}
          onAdd={addExercise}
          onOpenDraft={() => {
            setTrainingView("create");
            setActiveTab("trainings");
          }}
        />
      )}

      {activeTab === "trainings" && (
        <TrainingTemplates
          view={trainingView}
          setView={setTrainingView}
          draft={trainingDraft}
          setDraft={setTrainingDraft}
          templates={visibleTrainingTemplates}
          schedule={scheduledTrainings}
          onSchedule={(trainingId, dateKey) => setScheduledTrainings((current) => [{ id: createId("scheduled"), trainingId, dateKey, completed: false }, ...current])}
          onToggleScheduled={(id) => setScheduledTrainings((current) => current.map((item) => item.id === id ? { ...item, completed: !item.completed } : item))}
          onRemoveScheduled={(id) => setScheduledTrainings((current) => current.filter((item) => item.id !== id))}
          onUpdateExercise={updateDraftExercise}
          onMoveExercise={moveDraftExercise}
          onRemoveExercise={(index) => setTrainingDraft((current) => ({
            ...current,
            exercises: current.exercises.filter((_, itemIndex) => itemIndex !== index),
          }))}
          onBrowse={() => setActiveTab("exercises")}
          onSave={saveTrainingTemplate}
          onDelete={(id) => setTrainingTemplates((current) => current.filter((item) => item.id !== id))}
          onDuplicate={(template) => setTrainingDraft({
            name: `${template.name} - kopija`,
            focus: template.focus,
            exercises: template.exercises.map((item) => ({ ...item })),
          })}
        />
      )}

      {activeTab === "programs" && (
        <ProgramTemplates
          draft={programDraft}
          setDraft={setProgramDraft}
          trainings={visibleTrainingTemplates}
          programs={visibleProgramTemplates}
          onToggleTraining={toggleProgramTraining}
          onSave={saveProgramTemplate}
          onDelete={(id) => setProgramTemplates((current) => current.filter((item) => item.id !== id))}
          onDuplicate={(program) => setProgramDraft({
            name: `${program.name} - kopija`,
            goal: program.goal,
            weeks: program.weeks,
            trainingIds: [...program.trainingIds],
          })}
        />
      )}

      {selectedExercise && (
        <ExerciseDetails
          exercise={selectedExercise}
          canBuild
          added={trainingDraft.exercises.some((item) => item.exerciseId === selectedExercise.id)}
          onAdd={() => addExercise(selectedExercise)}
          onClose={() => setSelectedExercise(null)}
        />
      )}
    </div>
  );
}

function ExerciseBrowser({
  canBuild,
  search,
  setSearch,
  category,
  setCategory,
  equipment,
  setEquipment,
  exercises,
  draftCount,
  onOpen,
  onAdd,
  onOpenDraft,
}) {
  return (
    <div className="space-y-3">
      <Panel className="space-y-2.5 p-3">
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pretraži vežbe ili mišić..."
              className="w-full rounded-xl border border-white/10 bg-neutral-950/60 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500"
            />
          </label>
          <select
            value={equipment}
            onChange={(event) => setEquipment(event.target.value)}
            aria-label="Oprema"
            className="h-10 max-w-28 rounded-xl border border-white/10 bg-neutral-950/60 px-2 text-xs text-neutral-200 outline-none focus:border-brand-blue-500"
          >
            {EXERCISE_EQUIPMENT.map((option) => (
              <option key={option.value} value={option.value} className="bg-neutral-900">
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-6 gap-1">
          {EXERCISE_CATEGORIES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setCategory(option.value)}
              className={`min-w-0 rounded-lg px-1 py-1.5 text-[9px] font-medium leading-tight transition ${
                category === option.value
                  ? "bg-brand-blue-500 text-white"
                  : "bg-white/[0.04] text-neutral-400 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Panel>

      {canBuild && (
        <button
          type="button"
          onClick={onOpenDraft}
          className="flex w-full items-center justify-between rounded-xl border border-brand-green-500/25 bg-brand-green-500/10 px-3 py-2.5 text-left"
        >
          <span>
            <span className="block text-xs font-semibold text-brand-green-300">Nacrt treninga</span>
            <span className="text-[11px] text-neutral-400">{draftCount} izabranih vežbi</span>
          </span>
          <span className="text-xs font-medium text-brand-green-300">Otvori</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        {exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            canBuild={canBuild}
            onOpen={() => onOpen(exercise)}
            onAdd={() => onAdd(exercise)}
          />
        ))}
      </div>

      {exercises.length === 0 && (
        <EmptyState title="Nema rezultata" description="Promeni pretragu ili filter." />
      )}
    </div>
  );
}

function ExerciseCard({ exercise, canBuild, onOpen, onAdd }) {
  return (
    <Panel className="overflow-hidden">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <ExerciseMedia exercise={exercise} compact />
        <span className="block min-w-0 px-2.5 pb-2.5 pt-2">
          <span className="block min-h-9 text-xs font-semibold leading-snug text-white">
            {exercise.name}
          </span>
          <span className="mt-1 block truncate text-[10px] text-neutral-500">
            {exercise.primaryMuscles.join(" · ")}
          </span>
        </span>
      </button>
      {canBuild && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Dodaj ${exercise.name} u trening`}
          className="flex w-full items-center justify-center gap-1 border-t border-white/[0.06] py-2 text-[11px] font-medium text-brand-green-300 transition hover:bg-brand-green-500/10"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Dodaj
        </button>
      )}
    </Panel>
  );
}

function ExerciseMedia({ exercise, compact = false }) {
  const [position, setPosition] = useState(0);
  const swipeStart = useRef(null);
  const positions = ["Početak", "Sredina", "Kraj"];

  function movePosition(direction) {
    setPosition((current) => Math.max(0, Math.min(positions.length - 1, current + direction)));
  }

  function startSwipe(event) {
    if (compact || event.target.closest("button")) return;
    swipeStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function finishSwipe(event) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;

    const distanceX = event.clientX - start.x;
    const distanceY = event.clientY - start.y;
    if (Math.abs(distanceX) < 36 || Math.abs(distanceX) <= Math.abs(distanceY) * 1.15) return;
    movePosition(distanceX < 0 ? 1 : -1);
  }

  return (
    <div
      className={`relative overflow-hidden border-b border-white/[0.06] bg-[#090d15] ${compact ? "h-28" : "h-48 touch-pan-y select-none"}`}
      onPointerDown={startSwipe}
      onPointerUp={finishSwipe}
      onPointerCancel={() => { swipeStart.current = null; }}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-brand-blue-500" />
      <ExercisePose pose={exercise.pose} phase={position} className="absolute inset-0 h-full w-full text-neutral-300 transition-transform duration-200" />
      <div className="absolute left-2 top-2 rounded-md border border-white/10 bg-black/55 px-1.5 py-1 text-[9px] font-medium uppercase text-neutral-300 backdrop-blur-sm">
        {compact ? "3D prikaz" : positions[position]}
      </div>
      {!compact && (
        <>
          <button type="button" disabled={position === 0} onClick={() => movePosition(-1)} aria-label="Prethodna pozicija" className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/55 text-lg text-white backdrop-blur-sm disabled:opacity-20">‹</button>
          <button type="button" disabled={position === positions.length - 1} onClick={() => movePosition(1)} aria-label="Sledeća pozicija" className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/55 text-lg text-white backdrop-blur-sm disabled:opacity-20">›</button>
        </>
      )}
      <div className="absolute bottom-2 right-2 flex gap-1.5">
        {positions.map((label, index) => (
          <button
            key={label}
            type="button"
            disabled={compact}
            onClick={() => setPosition(index)}
            aria-label={label}
            className={`h-2 w-2 rounded-full transition ${index === position ? "bg-brand-blue-500" : "bg-white/20"}`}
          />
        ))}
      </div>
    </div>
  );
}

function ExercisePose({ pose, phase = 0, className }) {
  const poses = {
    squat: { head: [52, 26], body: "M52 36 48 59", arms: "M50 41 34 45M50 41 66 45", legs: "M48 59 35 73 29 91M48 59 62 72 68 91" },
    hinge: { head: [69, 32], body: "M63 41 42 59", arms: "M58 46 57 70M62 44 65 69", legs: "M42 59 35 82 34 94M42 59 54 78 58 94" },
    lunge: { head: [51, 23], body: "M51 33 49 58", arms: "M50 40 38 55M50 40 62 55", legs: "M49 58 34 72 20 88M49 58 64 72 82 75" },
    bridge: { head: [25, 58], body: "M34 60 59 48 78 61", arms: "M40 58 28 72M40 58 48 72", legs: "M78 61 88 76 92 92M78 61 69 78 67 93" },
    press: { head: [50, 32], body: "M50 42 50 72", arms: "M49 48 34 57 29 43M51 48 66 57 71 43", legs: "M50 72 39 92M50 72 61 92" },
    row: { head: [50, 28], body: "M50 38 50 68", arms: "M49 45 34 54 24 49M51 45 66 54 76 49", legs: "M50 68 38 91M50 68 62 91" },
    pulldown: { head: [50, 31], body: "M50 41 50 71", arms: "M48 46 31 35 24 18M52 46 69 35 76 18", legs: "M50 71 38 92M50 71 62 92" },
    overhead: { head: [50, 35], body: "M50 45 50 72", arms: "M48 49 35 34 34 15M52 49 65 34 66 15", legs: "M50 72 39 93M50 72 61 93" },
    plank: { head: [77, 50], body: "M67 54 40 62 20 68", arms: "M62 56 70 73 82 75", legs: "M22 68 12 82M25 67 18 84" },
    floor: { head: [23, 66], body: "M32 66 53 70", arms: "M38 67 49 48 55 30M40 68 61 56 75 47", legs: "M53 70 67 53 72 36M53 70 74 77 88 80" },
  };
  const current = poses[pose] || poses.row;
  const transforms = ["translate(-2 1) rotate(-3 50 55)", "translate(0 0)", "translate(2 1) rotate(3 50 55)"];
  return (
    <svg viewBox="0 0 100 110" fill="none" className={className} aria-hidden="true">
      <path d="M8 98H92" stroke="currentColor" strokeOpacity="0.12" />
      <g transform={transforms[phase]} className="transition-transform duration-200">
        <circle cx={current.head[0]} cy={current.head[1]} r="7" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="3" />
        <path d={current.body} stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
        <path d={current.arms} stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <path d={current.legs} stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      </g>
      <circle cx="84" cy="18" r="12" fill="#2f6bff" fillOpacity="0.12" />
      <circle cx="84" cy="18" r="4" fill="#22c55e" fillOpacity="0.8" />
    </svg>
  );
}

function TrainingTemplates(props) {
  const { view, setView } = props;
  const views = [
    { value: "today", label: "Danas" },
    { value: "week", label: "Ova nedelja" },
    { value: "create", label: "Kreiranje" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-neutral-950/60 p-1">
        {views.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setView(item.value)}
            className={`rounded-lg px-2 py-2 text-[11px] font-medium transition ${view === item.value ? "bg-white/10 text-white" : "text-neutral-400"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {view === "create" ? <TrainingBuilder {...props} /> : <ScheduleView {...props} />}
    </div>
  );
}

function TrainingBuilder({
  draft,
  setDraft,
  templates,
  onUpdateExercise,
  onMoveExercise,
  onRemoveExercise,
  onBrowse,
  onSave,
  onDelete,
  onDuplicate,
}) {
  return (
    <div className="space-y-3">
      <Panel className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Nacrt treninga</p>
            <p className="text-[11px] text-neutral-500">Čuva se samo na ovom uređaju.</p>
          </div>
          <StatusPill tone={draft.exercises.length ? "green" : "neutral"}>
            {draft.exercises.length} vežbi
          </StatusPill>
        </div>

        <div className="grid grid-cols-[1fr_9rem] gap-2">
          <input
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder="Naziv treninga"
            className="min-w-0 rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500"
          />
          <select
            value={draft.focus}
            onChange={(event) => setDraft((current) => ({ ...current, focus: event.target.value }))}
            className="min-w-0 rounded-xl border border-white/10 bg-neutral-950/60 px-2 text-xs text-white outline-none"
          >
            <option className="bg-neutral-900">Opšta priprema</option>
            <option className="bg-neutral-900">Snaga</option>
            <option className="bg-neutral-900">Hipertrofija</option>
            <option className="bg-neutral-900">Mobilnost</option>
            <option className="bg-neutral-900">Rehabilitacija</option>
          </select>
        </div>

        <div className="space-y-2">
          {draft.exercises.map((item, index) => {
            const exercise = getExerciseById(item.exerciseId);
            if (!exercise) return null;
            return (
              <div key={item.exerciseId} className="rounded-xl border border-white/10 bg-neutral-950/45 p-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue-500/10 text-xs font-semibold text-brand-blue-300">
                    {index + 1}
                  </div>
                  <p className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{exercise.name}</p>
                  <button type="button" disabled={index === 0} onClick={() => onMoveExercise(index, -1)} className="h-8 w-8 rounded-lg border border-white/10 text-neutral-400 disabled:opacity-25" aria-label="Pomeri gore">↑</button>
                  <button type="button" disabled={index === draft.exercises.length - 1} onClick={() => onMoveExercise(index, 1)} className="h-8 w-8 rounded-lg border border-white/10 text-neutral-400 disabled:opacity-25" aria-label="Pomeri dole">↓</button>
                  <button type="button" onClick={() => onRemoveExercise(index)} className="h-8 w-8 rounded-lg border border-red-400/20 text-red-300" aria-label="Ukloni vežbu">×</button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <SmallEditor label="Serije" type="number" value={item.sets} onChange={(value) => onUpdateExercise(index, { sets: Number(value) })} />
                  <SmallEditor label="Ponavljanja" value={item.reps} onChange={(value) => onUpdateExercise(index, { reps: value })} />
                  <SmallEditor label="Odmor" type="number" suffix="s" value={item.restSeconds} onChange={(value) => onUpdateExercise(index, { restSeconds: Number(value) })} />
                </div>
              </div>
            );
          })}
        </div>

        {draft.exercises.length === 0 && (
          <button type="button" onClick={onBrowse} className="w-full rounded-xl border border-dashed border-white/15 px-3 py-4 text-xs text-neutral-400">
            Otvori biblioteku i dodaj vežbe
          </button>
        )}

        <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
          <button type="button" onClick={onBrowse} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300">Dodaj vežbe</button>
          <button type="button" onClick={onSave} className="rounded-lg bg-brand-blue-500 px-3 py-2 text-xs font-semibold text-white shadow-glow">Sačuvaj trening</button>
        </div>
      </Panel>

      <TemplateList
        title="Sačuvani treninzi"
        empty="Još nema sačuvanih treninga."
        items={templates}
        renderMeta={(item) => `${item.exercises.length} vežbi · ${item.focus}`}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    </div>
  );
}

function dateKey(value = new Date()) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfCurrentWeek() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function ScheduleView({ view, templates, schedule, onSchedule, onToggleScheduled, onRemoveScheduled }) {
  const today = dateKey();
  const weekStart = startOfCurrentWeek();
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return { date, key: dateKey(date) };
  });
  const [trainingId, setTrainingId] = useState(templates[0]?.id || "");
  const [selectedDate, setSelectedDate] = useState(today);
  const effectiveTrainingId = templates.some((item) => item.id === trainingId)
    ? trainingId
    : templates[0]?.id || "";

  const visibleSchedule = schedule
    .filter((item) => view === "today"
      ? item.dateKey === today
      : weekDays.some((day) => day.key === item.dateKey))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  function addScheduledTraining() {
    const targetDate = view === "today" ? today : selectedDate;
    if (!effectiveTrainingId || !targetDate) return;
    onSchedule(effectiveTrainingId, targetDate);
  }

  return (
    <div className="space-y-3">
      <Panel className="space-y-3 p-3">
        <div>
          <p className="text-sm font-semibold text-white">{view === "today" ? "Plan za danas" : "Plan za ovu nedelju"}</p>
          <p className="text-[11px] text-neutral-500">Dodaj sačuvani trening u lični raspored.</p>
        </div>
        {view === "week" && (
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day) => {
              const count = schedule.filter((item) => item.dateKey === day.key).length;
              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => setSelectedDate(day.key)}
                  className={`rounded-lg py-1.5 text-center ${selectedDate === day.key ? "bg-brand-blue-500 text-white" : "bg-white/[0.04] text-neutral-400"}`}
                >
                  <span className="block text-[8px] uppercase">{day.date.toLocaleDateString("sr-Latn-RS", { weekday: "short" }).replace(".", "")}</span>
                  <span className="block text-[11px] font-semibold">{day.date.getDate()}</span>
                  <span className={`mx-auto mt-0.5 block h-1 w-1 rounded-full ${count ? "bg-brand-green-500" : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          <select value={effectiveTrainingId} onChange={(event) => setTrainingId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-neutral-950/60 px-2 text-xs text-white outline-none">
            {templates.map((template) => <option key={template.id} value={template.id} className="bg-neutral-900">{template.name}</option>)}
          </select>
          <button type="button" disabled={!effectiveTrainingId} onClick={addScheduledTraining} className="rounded-xl bg-brand-blue-500 px-3 text-xs font-semibold text-white disabled:opacity-40">Dodaj</button>
        </div>
      </Panel>

      <div className="space-y-2">
        {visibleSchedule.map((item) => {
          const training = templates.find((template) => template.id === item.trainingId);
          if (!training) return null;
          const scheduledDate = new Date(`${item.dateKey}T12:00:00`);
          return (
            <Panel key={item.id} className={`flex items-center gap-3 p-3 ${item.completed ? "opacity-60" : ""}`}>
              <button type="button" onClick={() => onToggleScheduled(item.id)} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm ${item.completed ? "border-brand-green-500 bg-brand-green-500 text-white" : "border-white/15 text-transparent"}`} aria-label={item.completed ? "Označi kao nezavršeno" : "Označi kao završeno"}>✓</button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className={`truncate text-sm font-semibold text-white ${item.completed ? "line-through" : ""}`}>{training.name}</p>
                  <TemplateSourceBadge source={training.source} demo={training.demo} />
                </div>
                <p className="mt-0.5 text-[10px] text-neutral-500">{scheduledDate.toLocaleDateString("sr-Latn-RS", { weekday: "long", day: "numeric", month: "short" })} · {training.exercises.length} vežbi</p>
              </div>
              <button type="button" onClick={() => onRemoveScheduled(item.id)} className="h-8 w-8 rounded-lg text-lg text-neutral-500" aria-label="Ukloni iz rasporeda">×</button>
            </Panel>
          );
        })}
        {visibleSchedule.length === 0 && <EmptyState title={view === "today" ? "Danas nema planiranog treninga" : "Ove nedelje nema planiranih treninga"} />}
      </div>
    </div>
  );
}

function ProgramTemplates({ draft, setDraft, trainings, programs, onToggleTraining, onSave, onDelete, onDuplicate }) {
  return (
    <div className="space-y-3">
      <Panel className="space-y-3 p-3">
        <div>
          <p className="text-sm font-semibold text-white">Nacrt programa</p>
          <p className="text-[11px] text-neutral-500">Spoji sačuvane treninge u višenedeljni plan.</p>
        </div>
        <input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder="Naziv programa"
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] font-medium uppercase text-neutral-500">
            Cilj
            <select value={draft.goal} onChange={(event) => setDraft((current) => ({ ...current, goal: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-neutral-950/60 px-2 text-xs normal-case text-white outline-none">
              <option className="bg-neutral-900">Opšta kondicija</option>
              <option className="bg-neutral-900">Snaga</option>
              <option className="bg-neutral-900">Hipertrofija</option>
              <option className="bg-neutral-900">Povratak treningu</option>
            </select>
          </label>
          <label className="text-[10px] font-medium uppercase text-neutral-500">
            Trajanje
            <select value={draft.weeks} onChange={(event) => setDraft((current) => ({ ...current, weeks: Number(event.target.value) }))} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-neutral-950/60 px-2 text-xs normal-case text-white outline-none">
              {[2, 4, 6, 8, 12].map((weeks) => <option key={weeks} value={weeks} className="bg-neutral-900">{weeks} nedelja</option>)}
            </select>
          </label>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-white">Treninzi u programu</p>
          <div className="space-y-1.5">
            {trainings.map((training) => {
              const selected = draft.trainingIds.includes(training.id);
              return (
                <button
                  key={training.id}
                  type="button"
                  onClick={() => onToggleTraining(training.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${selected ? "border-brand-green-500/30 bg-brand-green-500/10" : "border-white/10 bg-neutral-950/45"}`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs ${selected ? "border-brand-green-500 bg-brand-green-500 text-white" : "border-white/15 text-transparent"}`}>✓</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">{training.name}</span>
                  <span className="text-[10px] text-neutral-500">{training.exercises.length} vežbi</span>
                </button>
              );
            })}
          </div>
          {trainings.length === 0 && <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-neutral-500">Prvo sačuvaj bar jedan trening.</p>}
        </div>

        <div className="flex justify-end border-t border-white/10 pt-3">
          <button type="button" onClick={onSave} className="rounded-lg bg-brand-blue-500 px-3 py-2 text-xs font-semibold text-white shadow-glow">Sačuvaj program</button>
        </div>
      </Panel>

      <TemplateList
        title="Sačuvani programi"
        empty="Još nema sačuvanih programa."
        items={programs}
        renderMeta={(item) => `${item.weeks} nedelja · ${item.trainingIds.length} treninga`}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    </div>
  );
}

function TemplateList({ title, empty, items, renderMeta, onDuplicate, onDelete }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold text-neutral-300">{title}</p>
        <span className="text-[10px] text-neutral-500">{items.length}</span>
      </div>
      {items.map((item) => (
        <Panel key={item.id} className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-white">{item.name}</p>
              <TemplateSourceBadge source={item.source} demo={item.demo} />
            </div>
            <p className="mt-0.5 text-[11px] text-neutral-500">{renderMeta(item)}</p>
          </div>
          {onDuplicate && <button type="button" onClick={() => onDuplicate(item)} className="h-9 rounded-lg border border-white/10 px-2 text-[10px] text-neutral-300">Kopiraj</button>}
          {!item.demo && <button type="button" onClick={() => onDelete(item.id)} className="h-9 w-9 rounded-lg border border-red-400/20 text-sm text-red-300" aria-label={`Obriši ${item.name}`}>×</button>}
        </Panel>
      ))}
      {items.length === 0 && <EmptyState title={empty} />}
    </div>
  );
}

function TemplateSourceBadge({ source, demo = false }) {
  const trainer = source === "trainer";
  return (
    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-medium uppercase ${trainer ? "border-brand-green-500/25 bg-brand-green-500/10 text-brand-green-300" : "border-brand-blue-500/25 bg-brand-blue-500/10 text-brand-blue-300"}`}>
      {trainer ? (demo ? "Trener · primer" : "Trener") : "Moje"}
    </span>
  );
}

function SmallEditor({ label, value, onChange, type = "text", suffix = "" }) {
  return (
    <label className="min-w-0 text-[9px] font-medium uppercase text-neutral-500">
      {label}
      <span className="mt-1 flex items-center rounded-lg border border-white/10 bg-neutral-900 px-2">
        <input type={type} min={type === "number" ? 0 : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="h-8 min-w-0 flex-1 bg-transparent text-xs text-white outline-none" />
        {suffix && <span className="text-[10px] text-neutral-500">{suffix}</span>}
      </span>
    </label>
  );
}

function ExerciseDetails({ exercise, canBuild, added, onAdd, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={onClose} role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="exercise-title" onClick={(event) => event.stopPropagation()} className="flex h-[calc(100dvh-2rem)] max-h-[46rem] w-full max-w-md flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-2xl">
        <div className="relative shrink-0">
          <ExerciseMedia exercise={exercise} />
          <button type="button" onClick={onClose} aria-label="Zatvori" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/65 text-xl text-white backdrop-blur-sm">×</button>
        </div>
        <ScrollArea
          containerClassName="min-h-0 flex-1 overflow-hidden"
          className="h-full px-4 pb-6 pt-3"
          endShadowClassName="inset-x-0 bottom-0 h-10 bg-gradient-to-t from-neutral-900 via-neutral-900/80 to-transparent"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="exercise-title" className="text-lg font-semibold text-white">{exercise.name}</h2>
              <p className="mt-0.5 text-xs text-neutral-400">{exercise.primaryMuscles.join(" · ")}</p>
            </div>
            <StatusPill tone="blue">{exercise.level}</StatusPill>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <InfoBlock label="Primarno" value={exercise.primaryMuscles.join(", ")} />
            <InfoBlock label="Pomoćno" value={exercise.secondaryMuscles.join(", ")} />
          </div>

          <DetailSection title="Kako se izvodi">
            <ol className="space-y-2">
              {exercise.steps.map((step, index) => <li key={step} className="flex gap-2 text-xs leading-relaxed text-neutral-300"><span className="text-brand-blue-300">{index + 1}.</span><span>{step}</span></li>)}
            </ol>
          </DetailSection>
          <DetailSection title="Trener prati">
            <div className="flex flex-wrap gap-1.5">{exercise.cues.map((cue) => <span key={cue} className="rounded-full border border-brand-green-500/20 bg-brand-green-500/10 px-2 py-1 text-[10px] text-brand-green-300">{cue}</span>)}</div>
          </DetailSection>
          <DetailSection title="Česte greške">
            <ul className="space-y-1.5">{exercise.mistakes.map((mistake) => <li key={mistake} className="flex gap-2 text-xs text-neutral-400"><span className="text-red-300">•</span>{mistake}</li>)}</ul>
          </DetailSection>
        </ScrollArea>
        {canBuild && (
          <div className="relative z-30 shrink-0 border-t border-white/10 bg-neutral-900 p-3">
            <button type="button" disabled={added} onClick={onAdd} className="w-full rounded-xl bg-brand-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-glow disabled:bg-white/5 disabled:text-neutral-500 disabled:shadow-none">
              {added ? "Već je u nacrtu" : "Dodaj u trening"}
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}

function InfoBlock({ label, value }) {
  return <div className="rounded-xl bg-white/[0.04] px-3 py-2"><p className="text-[9px] font-medium uppercase text-neutral-500">{label}</p><p className="mt-0.5 text-xs text-neutral-200">{value}</p></div>;
}

function DetailSection({ title, children }) {
  return <section className="mt-4 border-t border-white/10 pt-3"><h3 className="mb-2 text-xs font-semibold text-white">{title}</h3>{children}</section>;
}

function SearchIcon({ className }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

function PlusIcon({ className }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}><path d="M12 5v14M5 12h14" /></svg>;
}
