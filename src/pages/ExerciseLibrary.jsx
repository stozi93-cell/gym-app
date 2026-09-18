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
const PROGRAM_DAYS = ["Dan 1", "Dan 2", "Dan 3", "Dan 4", "Dan 5", "Dan 6", "Dan 7"];

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
  weeklyPlan: [
    { dayIndex: 0, trainingId: DEMO_TRAININGS[0].id },
    { dayIndex: 1, trainingId: null },
    { dayIndex: 2, trainingId: DEMO_TRAININGS[1].id },
    { dayIndex: 3, trainingId: null },
    { dayIndex: 4, trainingId: DEMO_TRAININGS[0].id },
    { dayIndex: 5, trainingId: null },
    { dayIndex: 6, trainingId: null },
  ],
  source: "trainer",
  demo: true,
}];

const LIBRARY_TABS = [
  { value: "exercises", label: "Vežbe" },
  { value: "trainings", label: "Treninzi" },
  { value: "programs", label: "Programi" },
  { value: "calendar", label: "Kalendar" },
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
  return {
    name: "",
    focus: "Opšta priprema",
    notes: "",
    blocks: [{ id: "block-1", name: "Blok 1", pauseSeconds: 120 }],
    exercises: [],
  };
}

function emptyProgramDraft() {
  const weeks = 4;
  return {
    name: "",
    goal: "Opšta kondicija",
    weeks,
    trainingIds: [],
    weekPlans: Array.from({ length: weeks }, (_, weekIndex) => ({
      weekIndex,
      days: PROGRAM_DAYS.map((_, dayIndex) => ({ dayIndex, trainingId: null })),
    })),
  };
}

function normalizedWeekDays(storedDays) {
  const stored = Array.isArray(storedDays) ? storedDays : [];
  return PROGRAM_DAYS.map((_, dayIndex) => {
    const entry = stored.find((item) => Number(item.dayIndex) === dayIndex);
    return { dayIndex, trainingId: entry?.trainingId || null };
  });
}

function normalizedProgramWeeks(program) {
  const totalWeeks = Math.max(1, Math.min(52, Number(program.weeks) || 1));
  const storedWeeks = Array.isArray(program.weekPlans) ? program.weekPlans : [];
  const legacyWeek = normalizedWeekDays(program.weeklyPlan);
  return Array.from({ length: totalWeeks }, (_, weekIndex) => {
    const stored = storedWeeks.find((week) => Number(week.weekIndex) === weekIndex);
    return {
      weekIndex,
      days: stored ? normalizedWeekDays(stored.days) : legacyWeek.map((day) => ({ ...day })),
    };
  });
}

function normalizedTrainingBlocks(training) {
  if (Array.isArray(training.blocks) && training.blocks.length > 0) {
    return training.blocks.map((block, index) => ({
      id: block.id || `block-${index + 1}`,
      name: block.name || `Blok ${index + 1}`,
      pauseSeconds: Number.isFinite(Number(block.pauseSeconds)) ? Number(block.pauseSeconds) : 120,
    }));
  }
  return [{ id: "block-1", name: "Blok 1", pauseSeconds: 120 }];
}

function exerciseBlockId(item, blocks) {
  return blocks.some((block) => block.id === item.blockId) ? item.blockId : blocks[0].id;
}

function blockCountLabel(count) {
  if (count === 1) return "1 blok";
  if (count >= 2 && count <= 4) return `${count} bloka`;
  return `${count} blokova`;
}

function programScheduleStats(program) {
  const weeks = normalizedProgramWeeks(program);
  const totalTrainings = weeks.reduce((total, week) => total + week.days.filter((day) => day.trainingId).length, 0);
  return {
    totalTrainings,
    averagePerWeek: weeks.length ? Math.round((totalTrainings / weeks.length) * 10) / 10 : 0,
  };
}

export default function ExerciseLibrary() {
  const { profile, user } = useAuth();
  const coachMode = profile?.role === "admin";
  const [activeTab, setActiveTab] = useState("exercises");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [selectedProgram, setSelectedProgram] = useState(null);
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
      const blocks = normalizedTrainingBlocks(current);
      return {
        ...current,
        blocks,
        exercises: [
          ...current.exercises,
          { exerciseId: exercise.id, blockId: blocks[blocks.length - 1].id, sets: 3, reps: "8-10", weight: "", restSeconds: 90 },
        ],
      };
    });
    showStatus(`${exercise.name} je dodata u nacrt.`);
  }

  function removeExercise(exerciseId) {
    setTrainingDraft((current) => ({
      ...current,
      exercises: current.exercises.filter((item) => item.exerciseId !== exerciseId),
    }));
    showStatus("Vežba je uklonjena iz nacrta.");
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
      const blocks = normalizedTrainingBlocks(current);
      const currentBlock = exerciseBlockId(current.exercises[index], blocks);
      const blockIndexes = current.exercises
        .map((item, itemIndex) => ({ itemIndex, blockId: exerciseBlockId(item, blocks) }))
        .filter((item) => item.blockId === currentBlock)
        .map((item) => item.itemIndex);
      const position = blockIndexes.indexOf(index);
      const target = blockIndexes[position + direction];
      if (target === undefined) return current;
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
    setProgramDraft((current) => {
      const removing = current.trainingIds.includes(trainingId);
      return {
        ...current,
        trainingIds: removing
          ? current.trainingIds.filter((id) => id !== trainingId)
          : [...current.trainingIds, trainingId],
        weekPlans: normalizedProgramWeeks(current).map((week) => ({
          ...week,
          days: removing
            ? week.days.map((day) => day.trainingId === trainingId ? { ...day, trainingId: null } : day)
            : week.days,
        })),
      };
    });
  }

  function saveProgramTemplate() {
    const name = programDraft.name.trim();
    const weekPlans = normalizedProgramWeeks(programDraft);
    if (!name || programDraft.trainingIds.length === 0 || !weekPlans.some((week) => week.days.some((day) => day.trainingId))) {
      showStatus("Unesi naziv, izaberi trening i rasporedi ga u programu.");
      return;
    }

    setProgramTemplates((current) => [{
      ...programDraft,
      id: createId("program"),
      name,
      weeks: Number(programDraft.weeks),
      weekPlans,
      weeklyPlan: weekPlans[0].days,
      createdAt: new Date().toISOString(),
      source: coachMode ? "trainer" : "client",
    }, ...current]);
    setProgramDraft(emptyProgramDraft());
    showStatus("Program je sačuvan kao lokalni nacrt.");
  }

  return (
    <div className="mx-auto max-w-md space-y-3">
      <div className="grid grid-cols-4 gap-1 rounded-xl border border-white/10 bg-neutral-950/70 p-1">
          {LIBRARY_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`rounded-lg px-1 py-2 text-[11px] font-medium transition ${
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
        <div className="space-y-3">
          <TrainingDraftEditor
            draft={trainingDraft}
            setDraft={setTrainingDraft}
            onUpdateExercise={updateDraftExercise}
            onMoveExercise={moveDraftExercise}
            onMoveToBlock={(index, blockId) => updateDraftExercise(index, { blockId })}
            onRemoveExercise={(index) => setTrainingDraft((current) => ({
              ...current,
              exercises: current.exercises.filter((_, itemIndex) => itemIndex !== index),
            }))}
            onSave={saveTrainingTemplate}
          />
          <ExerciseBrowser
            canBuild
            search={search}
            setSearch={setSearch}
            category={category}
            setCategory={setCategory}
            equipment={equipment}
            setEquipment={setEquipment}
            exercises={filteredExercises}
            draftExercises={trainingDraft.exercises}
            onOpen={setSelectedExercise}
            onAdd={addExercise}
            onRemove={removeExercise}
          />
        </div>
      )}

      {activeTab === "trainings" && (
        <TrainingLibrary
          templates={visibleTrainingTemplates}
          programDraft={programDraft}
          setProgramDraft={setProgramDraft}
          onToggleProgramTraining={toggleProgramTraining}
          onSaveProgram={saveProgramTemplate}
          onOpen={setSelectedTraining}
          onDelete={(id) => setTrainingTemplates((current) => current.filter((item) => item.id !== id))}
          onEditCopy={(template) => {
            setTrainingDraft({
              name: `${template.name} - kopija`,
              focus: template.focus,
              notes: template.notes || "",
              blocks: normalizedTrainingBlocks(template).map((block) => ({ ...block })),
              exercises: template.exercises.map((item) => ({ ...item })),
            });
            setActiveTab("exercises");
          }}
        />
      )}

      {activeTab === "programs" && (
        <ProgramLibrary
          programs={visibleProgramTemplates}
          onOpen={setSelectedProgram}
          onDelete={(id) => setProgramTemplates((current) => current.filter((item) => item.id !== id))}
          onEditCopy={(program) => {
            setProgramDraft({
              name: `${program.name} - kopija`,
              goal: program.goal,
              weeks: program.weeks,
              trainingIds: [...program.trainingIds],
              weekPlans: normalizedProgramWeeks(program),
              weeklyPlan: normalizedProgramWeeks(program)[0].days,
            });
            setActiveTab("trainings");
          }}
        />
      )}

      {activeTab === "calendar" && (
        <TrainingCalendar
          trainings={visibleTrainingTemplates}
          programs={visibleProgramTemplates}
          schedule={scheduledTrainings}
          onSchedule={(entryType, templateId, selectedDate) => setScheduledTrainings((current) => [{
            id: createId("scheduled"),
            entryType,
            templateId,
            dateKey: selectedDate,
            status: "planned",
          }, ...current])}
          onUpdate={(id, patch) => setScheduledTrainings((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))}
          onRemove={(id) => setScheduledTrainings((current) => current.filter((item) => item.id !== id))}
          onOpenTraining={setSelectedTraining}
          onOpenProgram={setSelectedProgram}
        />
      )}

      {selectedExercise && (
        <ExerciseDetails
          exercise={selectedExercise}
          canBuild
          added={trainingDraft.exercises.some((item) => item.exerciseId === selectedExercise.id)}
          onAdd={() => addExercise(selectedExercise)}
          onRemove={() => removeExercise(selectedExercise.id)}
          onClose={() => setSelectedExercise(null)}
        />
      )}

      {selectedTraining && (
        <TrainingDetails training={selectedTraining} elevated={Boolean(selectedProgram)} onOpenExercise={setSelectedExercise} onClose={() => setSelectedTraining(null)} />
      )}

      {selectedProgram && (
        <ProgramDetails
          program={selectedProgram}
          trainings={visibleTrainingTemplates}
          onOpenTraining={setSelectedTraining}
          onClose={() => setSelectedProgram(null)}
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
  draftExercises,
  onOpen,
  onAdd,
  onRemove,
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

      <div className="grid grid-cols-2 gap-2">
        {exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            canBuild={canBuild}
            added={draftExercises.some((item) => item.exerciseId === exercise.id)}
            onOpen={() => onOpen(exercise)}
            onAdd={() => onAdd(exercise)}
            onRemove={() => onRemove(exercise.id)}
          />
        ))}
      </div>

      {exercises.length === 0 && (
        <EmptyState title="Nema rezultata" description="Promeni pretragu ili filter." />
      )}
    </div>
  );
}

function ExerciseCard({ exercise, canBuild, added, onOpen, onAdd, onRemove }) {
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
          onClick={added ? onRemove : onAdd}
          aria-label={`${added ? "Ukloni" : "Dodaj"} ${exercise.name} ${added ? "iz" : "u"} trening`}
          className={`flex w-full items-center justify-center gap-1 border-t py-2 text-[11px] font-medium transition ${added ? "border-red-400/15 bg-red-500/10 text-red-300 hover:bg-red-500/15" : "border-white/[0.06] text-brand-green-300 hover:bg-brand-green-500/10"}`}
        >
          {added ? <span className="text-base leading-none">×</span> : <PlusIcon className="h-3.5 w-3.5" />}
          {added ? "Ukloni" : "Dodaj"}
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
      {!compact && (
        <div className="absolute bottom-2 right-2 flex gap-1.5">
          {positions.map((label, index) => (
            <button key={label} type="button" onClick={() => setPosition(index)} aria-label={label} className={`h-2 w-2 rounded-full transition ${index === position ? "bg-brand-blue-500" : "bg-white/20"}`} />
          ))}
        </div>
      )}
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

function TrainingDraftEditor({ draft, setDraft, onUpdateExercise, onMoveExercise, onMoveToBlock, onRemoveExercise, onSave }) {
  const [expanded, setExpanded] = useState(draft.exercises.length > 0);
  const blocks = normalizedTrainingBlocks(draft);

  function addBlock() {
    setDraft((current) => {
      const currentBlocks = normalizedTrainingBlocks(current);
      return {
        ...current,
        blocks: [...currentBlocks, { id: createId("block"), name: `Blok ${currentBlocks.length + 1}`, pauseSeconds: 120 }],
      };
    });
  }

  function updateBlock(blockId, patch) {
    setDraft((current) => ({
      ...current,
      blocks: normalizedTrainingBlocks(current).map((block) => block.id === blockId ? { ...block, ...patch } : block),
    }));
  }

  function removeBlock(blockId) {
    setDraft((current) => {
      const currentBlocks = normalizedTrainingBlocks(current);
      if (currentBlocks.length === 1) return current;
      const remainingBlocks = currentBlocks.filter((block) => block.id !== blockId).map((block, index) => ({ ...block, name: `Blok ${index + 1}` }));
      return {
        ...current,
        blocks: remainingBlocks,
        exercises: current.exercises.map((item) => exerciseBlockId(item, currentBlocks) === blockId ? { ...item, blockId: remainingBlocks[0].id } : item),
      };
    });
  }

  function clearDraft() {
    if (draft.exercises.length > 0 && !window.confirm("Obrisati ceo nacrt treninga?")) return;
    setDraft(emptyTrainingDraft());
  }

  return (
    <Panel className="overflow-hidden">
      <button type="button" onClick={() => setExpanded((current) => !current)} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue-500/12 text-xl text-brand-blue-300">+</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">Novi trening</span>
          <span className="block text-[11px] text-neutral-500">{draft.exercises.length ? `${draft.exercises.length} izabranih vežbi` : "Izaberi vežbe sa liste"}</span>
        </span>
        <span className="text-[11px] font-medium text-brand-blue-300">{expanded ? "Zatvori" : "Uredi"}</span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-white/10 p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Naziv treninga" className="min-w-0 rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500" />
            <select value={draft.focus} onChange={(event) => setDraft((current) => ({ ...current, focus: event.target.value }))} className="min-w-0 rounded-xl border border-white/10 bg-neutral-950/60 px-2 text-xs text-white outline-none">
              <option className="bg-neutral-900">Opšta priprema</option>
              <option className="bg-neutral-900">Snaga</option>
              <option className="bg-neutral-900">Hipertrofija</option>
              <option className="bg-neutral-900">Mobilnost</option>
              <option className="bg-neutral-900">Rehabilitacija</option>
            </select>
          </div>
          <textarea
            value={draft.notes || ""}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Napomene za trening..."
            rows="2"
            className="w-full resize-none rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm leading-relaxed text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500"
          />

          <div className="space-y-3">
            {blocks.map((block, blockIndex) => {
              const blockExercises = draft.exercises
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => exerciseBlockId(item, blocks) === block.id);
              return (
                <section key={block.id} className="overflow-hidden rounded-xl border border-white/10 bg-neutral-950/35">
                  <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-blue-500/12 text-[11px] font-semibold text-brand-blue-300">{blockIndex + 1}</span>
                    <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-white">{block.name}</p><p className="text-[9px] text-neutral-500">{blockExercises.length} vežbi</p></div>
                    {blocks.length > 1 && <button type="button" onClick={() => removeBlock(block.id)} className="h-7 w-7 rounded-lg text-red-300" aria-label={`Ukloni ${block.name}`}>×</button>}
                  </div>

                  <div className="space-y-2 p-2.5">
                    {blockExercises.map(({ item, index }, position) => {
                      const exercise = getExerciseById(item.exerciseId);
                      if (!exercise) return null;
                      return (
                        <div key={item.exerciseId} className="rounded-xl border border-white/[0.08] bg-neutral-950/55 p-2.5">
                          <div className="flex items-center gap-1.5">
                            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{exercise.name}</p>
                            {blocks.length > 1 && (
                              <select value={block.id} onChange={(event) => onMoveToBlock(index, event.target.value)} aria-label={`Blok za ${exercise.name}`} className="h-8 w-12 rounded-lg border border-white/10 bg-neutral-900 px-1 text-[10px] text-white outline-none">
                                {blocks.map((choice, choiceIndex) => <option key={choice.id} value={choice.id} className="bg-neutral-900">B{choiceIndex + 1}</option>)}
                              </select>
                            )}
                            <button type="button" disabled={position === 0} onClick={() => onMoveExercise(index, -1)} className="h-8 w-7 rounded-lg border border-white/10 text-neutral-400 disabled:opacity-25" aria-label="Pomeri gore">↑</button>
                            <button type="button" disabled={position === blockExercises.length - 1} onClick={() => onMoveExercise(index, 1)} className="h-8 w-7 rounded-lg border border-white/10 text-neutral-400 disabled:opacity-25" aria-label="Pomeri dole">↓</button>
                            <button type="button" onClick={() => onRemoveExercise(index)} className="h-8 w-7 rounded-lg border border-red-400/20 text-red-300" aria-label="Ukloni vežbu">×</button>
                          </div>
                          <div className="mt-2 grid grid-cols-4 gap-1.5">
                            <SmallEditor label="Serije" type="number" value={item.sets} onChange={(value) => onUpdateExercise(index, { sets: Number(value) })} />
                            <SmallEditor label="Ponav." value={item.reps} onChange={(value) => onUpdateExercise(index, { reps: value })} />
                            <SmallEditor label="Težina" type="number" suffix="kg" value={item.weight ?? ""} onChange={(value) => onUpdateExercise(index, { weight: value })} />
                            <SmallEditor label="Odmor" type="number" suffix="s" value={item.restSeconds} onChange={(value) => onUpdateExercise(index, { restSeconds: Number(value) })} />
                          </div>
                        </div>
                      );
                    })}
                    {blockExercises.length === 0 && <p className="py-2 text-center text-[10px] text-neutral-600">{blockIndex === blocks.length - 1 ? "Nove vežbe se dodaju u ovaj blok." : "Premesti vežbu izborom njenog bloka."}</p>}
                  </div>

                  {blockIndex < blocks.length - 1 && (
                    <label className="flex items-center justify-between border-t border-amber-400/15 bg-amber-400/[0.05] px-3 py-2 text-[10px] text-amber-200/80">
                      Pauza do sledećeg bloka
                      <span className="flex items-center gap-1"><input type="number" min="0" step="15" value={block.pauseSeconds} onChange={(event) => updateBlock(block.id, { pauseSeconds: Number(event.target.value) })} className="h-8 w-16 rounded-lg border border-amber-300/15 bg-neutral-950/70 px-2 text-right text-xs text-white outline-none" /> s</span>
                    </label>
                  )}
                </section>
              );
            })}
            <button type="button" onClick={addBlock} className="w-full rounded-xl border border-dashed border-brand-blue-500/25 py-2.5 text-xs font-medium text-brand-blue-300">+ Dodaj blok</button>
            {draft.exercises.length === 0 && <p className="text-center text-[10px] text-neutral-500">Dodaj vežbe iz biblioteke ispod.</p>}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-3">
            <button type="button" onClick={clearDraft} className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">Očisti</button>
            <button type="button" onClick={onSave} className="rounded-lg bg-brand-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-glow">Sačuvaj trening</button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function TrainingLibrary({ templates, programDraft, setProgramDraft, onToggleProgramTraining, onSaveProgram, onOpen, onDelete, onEditCopy }) {
  const [creatingProgram, setCreatingProgram] = useState(programDraft.trainingIds.length > 0);

  function saveProgram() {
    const hasScheduledTraining = normalizedProgramWeeks(programDraft).some((week) => week.days.some((day) => day.trainingId));
    onSaveProgram();
    if (programDraft.name.trim() && programDraft.trainingIds.length > 0 && hasScheduledTraining) setCreatingProgram(false);
  }

  function toggleTraining(trainingId, selected) {
    if (!selected) setCreatingProgram(true);
    onToggleProgramTraining(trainingId);
  }

  return (
    <div className="space-y-3">
      <ProgramDraftEditor
        expanded={creatingProgram}
        setExpanded={setCreatingProgram}
        draft={programDraft}
        setDraft={setProgramDraft}
        trainings={templates.filter((training) => programDraft.trainingIds.includes(training.id))}
        onSave={saveProgram}
      />

      <div className="px-1">
        <div>
          <p className="text-sm font-semibold text-white">Sačuvani treninzi</p>
          <p className="text-[11px] text-neutral-500">Otvori trening ili ga dodaj u novi program.</p>
        </div>
      </div>

      <div className="space-y-2">
        {templates.map((training) => {
          const selected = programDraft.trainingIds.includes(training.id);
          return (
            <Panel key={training.id} className={`overflow-hidden ${selected ? "border-brand-green-500/35" : ""}`}>
              <button type="button" onClick={() => onOpen(training)} className="block w-full text-left">
                <TrainingPreview training={training} selected={selected} />
                <span className="flex items-center gap-3 p-3">
                  <TemplateSummary item={training} meta={`${training.exercises.length} vežbi · ${blockCountLabel(normalizedTrainingBlocks(training).length)} · ${training.focus}`} />
                  <span className="text-lg text-neutral-600">›</span>
                </span>
              </button>
              <div className="flex items-center justify-between border-t border-white/[0.06] px-2 py-1.5">
                <button type="button" onClick={() => toggleTraining(training.id, selected)} className={`rounded-lg px-3 py-1.5 text-[10px] font-semibold ${selected ? "bg-red-500/10 text-red-300" : "bg-brand-green-500/10 text-brand-green-300"}`}>{selected ? "Ukloni iz programa" : "Dodaj u program"}</button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => onEditCopy(training)} className="rounded-lg px-2 py-1.5 text-[10px] text-neutral-300">Kopiraj i uredi</button>
                  {!training.demo && <button type="button" onClick={() => onDelete(training.id)} className="h-7 w-7 rounded-lg text-red-300" aria-label={`Obriši ${training.name}`}>×</button>}
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
      {templates.length === 0 && <EmptyState title="Još nema sačuvanih treninga" />}
    </div>
  );
}

function ProgramDraftEditor({ expanded, setExpanded, draft, setDraft, trainings, onSave }) {
  const [activeWeek, setActiveWeek] = useState(0);
  const weekPlans = normalizedProgramWeeks(draft);
  const effectiveWeek = Math.min(activeWeek, weekPlans.length - 1);
  const activePlan = weekPlans[effectiveWeek];
  const trainingDays = activePlan.days.filter((day) => day.trainingId).length;
  const restDays = PROGRAM_DAYS.length - trainingDays;

  function updateDay(dayIndex, trainingId) {
    setDraft((current) => ({
      ...current,
      weekPlans: normalizedProgramWeeks(current).map((week) => week.weekIndex === effectiveWeek
        ? { ...week, days: week.days.map((day) => day.dayIndex === dayIndex ? { ...day, trainingId: trainingId || null } : day) }
        : week),
    }));
  }

  function updateDuration(value) {
    const weeks = Math.max(1, Math.min(52, Number(value) || 1));
    setDraft((current) => ({
      ...current,
      weeks,
      weekPlans: normalizedProgramWeeks({ ...current, weeks }),
    }));
    if (activeWeek >= weeks) setActiveWeek(weeks - 1);
  }

  function copyPreviousWeek() {
    if (effectiveWeek === 0) return;
    setDraft((current) => {
      const plans = normalizedProgramWeeks(current);
      const previous = plans[effectiveWeek - 1].days.map((day) => ({ ...day }));
      return { ...current, weekPlans: plans.map((week) => week.weekIndex === effectiveWeek ? { ...week, days: previous } : week) };
    });
  }

  function repeatToEnd() {
    setDraft((current) => {
      const plans = normalizedProgramWeeks(current);
      const source = plans[effectiveWeek].days;
      return {
        ...current,
        weekPlans: plans.map((week) => week.weekIndex > effectiveWeek
          ? { ...week, days: source.map((day) => ({ ...day })) }
          : week),
      };
    });
  }

  function clearProgram() {
    const hasContent = draft.name.trim() || draft.trainingIds.length > 0;
    if (hasContent && !window.confirm("Obrisati ceo nacrt programa?")) return;
    setDraft(emptyProgramDraft());
  }

  return (
    <Panel className="overflow-hidden">
      <button type="button" onClick={() => setExpanded((current) => !current)} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-green-500/10 text-xl text-brand-green-300">+</span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">Novi program</span><span className="block text-[11px] text-neutral-500">{draft.trainingIds.length ? `${draft.trainingIds.length} izabranih treninga` : "Izaberi treninge sa liste"}</span></span>
        <span className="text-[11px] font-medium text-brand-green-300">{expanded ? "Zatvori" : "Uredi"}</span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-white/10 p-3">
          <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Naziv programa" className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-green-500" />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[9px] font-medium uppercase text-neutral-500">Cilj
              <select value={draft.goal} onChange={(event) => setDraft((current) => ({ ...current, goal: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-neutral-950/60 px-2 text-xs normal-case text-white outline-none">
                <option className="bg-neutral-900">Opšta kondicija</option><option className="bg-neutral-900">Snaga</option><option className="bg-neutral-900">Hipertrofija</option><option className="bg-neutral-900">Povratak treningu</option>
              </select>
            </label>
            <label className="text-[9px] font-medium uppercase text-neutral-500">Trajanje
              <span className="mt-1 flex h-10 items-center rounded-xl border border-white/10 bg-neutral-950/60 px-2"><input type="number" min="1" max="52" value={draft.weeks} onChange={(event) => updateDuration(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none" /><span className="text-[10px] normal-case text-neutral-500">nedelja</span></span>
            </label>
          </div>

          <div>
            <p className="mb-2 text-[9px] font-medium uppercase text-neutral-500">Nedelja programa</p>
            <ScrollArea orientation="horizontal" className="flex gap-1.5 pb-1" endShadowClassName="inset-y-0 right-0 w-9 bg-gradient-to-l from-neutral-900 via-neutral-900/80 to-transparent">
              {weekPlans.map((week) => {
                const scheduled = week.days.filter((day) => day.trainingId).length;
                return <button key={week.weekIndex} type="button" onClick={() => setActiveWeek(week.weekIndex)} className={`w-14 shrink-0 rounded-lg border px-1 py-1.5 text-center ${effectiveWeek === week.weekIndex ? "border-brand-blue-500 bg-brand-blue-500 text-white" : "border-white/10 bg-white/[0.035] text-neutral-400"}`}><span className="block text-[9px]">NED</span><span className="block text-xs font-semibold">{week.weekIndex + 1}</span><span className={`mx-auto mt-1 block h-1 w-1 rounded-full ${scheduled ? "bg-brand-green-400" : "bg-transparent"}`} /></button>;
              })}
            </ScrollArea>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-brand-green-500/[0.08] px-3 py-2"><p className="text-lg font-semibold text-brand-green-300">{trainingDays}</p><p className="text-[9px] uppercase text-neutral-500">treninga u 7 dana</p></div>
            <div className="rounded-xl bg-white/[0.035] px-3 py-2"><p className="text-lg font-semibold text-neutral-200">{restDays}</p><p className="text-[9px] uppercase text-neutral-500">dana odmora</p></div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-white">Raspored · nedelja {effectiveWeek + 1}</p><div className="flex gap-1">{effectiveWeek > 0 && <button type="button" onClick={copyPreviousWeek} className="rounded-md bg-white/[0.05] px-2 py-1 text-[8px] text-neutral-400">Kopiraj prethodnu</button>}{effectiveWeek < weekPlans.length - 1 && <button type="button" onClick={repeatToEnd} className="rounded-md bg-brand-blue-500/10 px-2 py-1 text-[8px] text-brand-blue-300">Ponovi do kraja</button>}</div></div>
            <div className="space-y-1.5">
              {activePlan.days.map((day) => (
                <label key={day.dayIndex} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${day.trainingId ? "border-brand-green-500/20 bg-brand-green-500/[0.06]" : "border-white/[0.07] bg-neutral-950/35"}`}>
                  <span className="w-20 shrink-0 text-[11px] font-medium text-neutral-300">{PROGRAM_DAYS[day.dayIndex]}</span>
                  <select value={day.trainingId || ""} onChange={(event) => updateDay(day.dayIndex, event.target.value)} className={`h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-neutral-950/70 px-2 text-[10px] outline-none ${day.trainingId ? "text-white" : "text-neutral-500"}`}>
                    <option value="" className="bg-neutral-900">Odmor</option>
                    {trainings.map((training) => <option key={training.id} value={training.id} className="bg-neutral-900">{training.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {trainings.length === 0 && <p className="mt-2 text-center text-[10px] text-neutral-500">Dodaj treninge iz liste ispod, pa ih rasporedi po danima.</p>}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-3">
            <button type="button" onClick={clearProgram} className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">Očisti</button>
            <button type="button" onClick={onSave} className="rounded-lg bg-brand-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-glow">Sačuvaj program</button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function TrainingPreview({ training, selected = false }) {
  const exercises = training.exercises
    .slice(0, 3)
    .map((item) => getExerciseById(item.exerciseId))
    .filter(Boolean);
  const hiddenCount = Math.max(0, training.exercises.length - exercises.length);

  return (
    <div className="relative h-28 overflow-hidden border-b border-white/[0.06] bg-[#090d15]">
      <div className="absolute inset-y-0 left-0 z-10 w-1 bg-brand-blue-500" />
      <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${Math.max(1, exercises.length)}, minmax(0, 1fr))` }}>
        {exercises.map((exercise, index) => (
          <div key={exercise.id} className="relative min-w-0 overflow-hidden border-r border-white/[0.05] last:border-r-0">
            <ExercisePose pose={exercise.pose} phase={index % 3} className="absolute inset-0 h-full w-full scale-110 text-neutral-500" />
            <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-black/50 text-[9px] font-semibold text-neutral-300">{index + 1}</span>
          </div>
        ))}
        {exercises.length === 0 && <div className="flex items-center justify-center text-xs text-neutral-600">Prazan trening</div>}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/85 to-transparent" />
      <div className="absolute bottom-2 left-3 flex gap-1.5">
        <span className="rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[9px] text-neutral-300">{training.exercises.length} vežbi</span>
        <span className="rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[9px] text-neutral-300">{blockCountLabel(normalizedTrainingBlocks(training).length)}</span>
      </div>
      {hiddenCount > 0 && <span className="absolute bottom-2 right-3 rounded-md bg-brand-blue-500 px-2 py-1 text-[9px] font-semibold text-white">+{hiddenCount}</span>}
      {selected && <span className="absolute right-3 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand-green-500 text-sm font-semibold text-white shadow-lg">✓</span>}
    </div>
  );
}

function ProgramLibrary({ programs, onOpen, onDelete, onEditCopy }) {
  return (
    <div className="space-y-3">
      <div className="px-1">
        <p className="text-sm font-semibold text-white">Programi</p>
        <p className="text-[11px] text-neutral-500">Kompletni planovi sastavljeni od više treninga.</p>
      </div>
      <div className="space-y-2">
        {programs.map((program) => {
          const stats = programScheduleStats(program);
          return (
            <Panel key={program.id} className="overflow-hidden">
              <button type="button" onClick={() => onOpen(program)} className="block w-full text-left">
                <ProgramPreview program={program} />
                <span className="flex items-center gap-3 p-3">
                  <TemplateSummary item={program} meta={stats.totalTrainings ? `${stats.averagePerWeek}x / 7 dana · ${program.weeks} nedelja · ${program.goal}` : `${program.weeks} nedelja · raspored nije definisan`} />
                  <span className="text-lg text-neutral-600">›</span>
                </span>
              </button>
              <div className="flex justify-end gap-2 border-t border-white/[0.06] px-2 py-1.5">
                <button type="button" onClick={() => onEditCopy(program)} className="rounded-lg px-2 py-1.5 text-[10px] text-neutral-300">Kopiraj i uredi</button>
                {!program.demo && <button type="button" onClick={() => onDelete(program.id)} className="h-7 w-7 rounded-lg text-red-300" aria-label={`Obriši ${program.name}`}>×</button>}
              </div>
            </Panel>
          );
        })}
      </div>
      {programs.length === 0 && <EmptyState title="Još nema sačuvanih programa" />}
    </div>
  );
}

function ProgramPreview({ program }) {
  const weeks = normalizedProgramWeeks(program);
  const previewWeeks = weeks.slice(0, 6);
  const hiddenWeeks = Math.max(0, weeks.length - previewWeeks.length);
  const stats = programScheduleStats(program);
  return (
    <div className="relative overflow-hidden border-b border-white/[0.06] bg-[#090d15] px-3 pb-3 pt-2.5">
      <div className="absolute inset-y-0 left-0 w-1 bg-brand-green-500" />
      <div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium uppercase text-neutral-500">Plan programa</span><span className="text-[9px] text-brand-green-300">{stats.totalTrainings} treninga ukupno</span></div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, previewWeeks.length)}, minmax(0, 1fr))` }}>
        {previewWeeks.map((week) => (
          <div key={week.weekIndex} className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-1.5">
            <p className="mb-1 text-center text-[8px] font-medium text-neutral-500">N{week.weekIndex + 1}</p>
            <div className="grid grid-cols-7 gap-0.5">{week.days.map((day) => <span key={day.dayIndex} className={`h-3 rounded-sm ${day.trainingId ? "bg-brand-green-500" : "bg-white/[0.07]"}`} />)}</div>
          </div>
        ))}
      </div>
      {hiddenWeeks > 0 && <span className="absolute right-3 top-9 rounded-md bg-brand-blue-500 px-2 py-1 text-[9px] font-semibold text-white">+{hiddenWeeks}</span>}
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

function calendarDaysFor(monthCursor) {
  const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1, 12);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return date;
  });
}

function resolveScheduleItem(item, trainings, programs) {
  const entryType = item.entryType || "training";
  const templateId = item.templateId || item.trainingId;
  const template = (entryType === "program" ? programs : trainings).find((candidate) => candidate.id === templateId);
  return {
    ...item,
    entryType,
    templateId,
    template,
    status: item.status || (item.completed ? "completed" : "planned"),
  };
}

function TrainingCalendar({ trainings, programs, schedule, onSchedule, onUpdate, onRemove, onOpenTraining, onOpenProgram }) {
  const today = dateKey();
  const [monthCursor, setMonthCursor] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1, 12);
  });
  const [selectedDate, setSelectedDate] = useState(today);
  const [entryType, setEntryType] = useState("training");
  const [templateId, setTemplateId] = useState(trainings[0]?.id || "");
  const days = useMemo(() => calendarDaysFor(monthCursor), [monthCursor]);
  const choices = entryType === "training" ? trainings : programs;
  const effectiveTemplateId = choices.some((item) => item.id === templateId) ? templateId : choices[0]?.id || "";
  const selectedItems = schedule
    .filter((item) => item.dateKey === selectedDate)
    .map((item) => resolveScheduleItem(item, trainings, programs))
    .filter((item) => item.template);

  function changeMonth(offset) {
    const next = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + offset, 1, 12);
    setMonthCursor(next);
    setSelectedDate(dateKey(next));
  }

  function changeEntryType(value) {
    setEntryType(value);
    const nextChoices = value === "training" ? trainings : programs;
    setTemplateId(nextChoices[0]?.id || "");
  }

  function addToCalendar() {
    if (!effectiveTemplateId) return;
    onSchedule(entryType, effectiveTemplateId, selectedDate);
  }

  return (
    <div className="space-y-3">
      <Panel className="p-3">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => changeMonth(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-xl text-neutral-300" aria-label="Prethodni mesec">‹</button>
          <p className="text-sm font-semibold capitalize text-white">{monthCursor.toLocaleDateString("sr-Latn-RS", { month: "long", year: "numeric" })}</p>
          <button type="button" onClick={() => changeMonth(1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-xl text-neutral-300" aria-label="Sledeći mesec">›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[8px] font-medium uppercase text-neutral-600">
          {['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const key = dateKey(day);
            const inMonth = day.getMonth() === monthCursor.getMonth();
            const count = schedule.filter((item) => item.dateKey === key).length;
            const selected = key === selectedDate;
            return (
              <button key={key} type="button" onClick={() => setSelectedDate(key)} className={`relative h-10 rounded-lg text-xs font-medium transition ${selected ? "bg-brand-blue-500 text-white" : key === today ? "bg-brand-blue-500/12 text-brand-blue-200" : inMonth ? "bg-white/[0.035] text-neutral-300" : "text-neutral-700"}`}>
                {day.getDate()}
                {count > 0 && <span className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${selected ? "bg-white" : "bg-brand-green-400"}`} />}
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel className="space-y-3 p-3">
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-semibold text-white">Dodaj u raspored</p><p className="text-[10px] text-neutral-500">{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("sr-Latn-RS", { weekday: "long", day: "numeric", month: "long" })}</p></div>
          <div className="flex rounded-lg bg-white/[0.04] p-1">
            <button type="button" onClick={() => changeEntryType("training")} className={`rounded-md px-2 py-1.5 text-[10px] ${entryType === "training" ? "bg-white/10 text-white" : "text-neutral-500"}`}>Trening</button>
            <button type="button" onClick={() => changeEntryType("program")} className={`rounded-md px-2 py-1.5 text-[10px] ${entryType === "program" ? "bg-white/10 text-white" : "text-neutral-500"}`}>Program</button>
          </div>
        </div>
        <div className="flex gap-2">
          <select value={effectiveTemplateId} onChange={(event) => setTemplateId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-neutral-950/60 px-2 text-xs text-white outline-none">
            {choices.map((item) => <option key={item.id} value={item.id} className="bg-neutral-900">{item.name}</option>)}
          </select>
          <button type="button" disabled={!effectiveTemplateId} onClick={addToCalendar} className="rounded-xl bg-brand-blue-500 px-4 text-xs font-semibold text-white disabled:opacity-35">Dodaj</button>
        </div>
      </Panel>

      <div className="space-y-2">
        {selectedItems.map((item) => {
          const completed = item.status === "completed";
          const active = item.status === "active";
          return (
            <Panel key={item.id} className={`overflow-hidden ${completed ? "opacity-65" : ""}`}>
              <button type="button" onClick={() => item.entryType === "program" ? onOpenProgram(item.template) : onOpenTraining(item.template)} className="flex w-full items-center gap-3 p-3 text-left">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold uppercase ${item.entryType === "program" ? "bg-brand-green-500/10 text-brand-green-300" : "bg-brand-blue-500/10 text-brand-blue-300"}`}>{item.entryType === "program" ? "PR" : "TR"}</span>
                <TemplateSummary item={item.template} meta={item.entryType === "program" ? `${item.template.weeks} nedelja` : `${item.template.exercises.length} vežbi`} />
                {active && <StatusPill tone="blue">U toku</StatusPill>}
                {completed && <StatusPill tone="green">Završeno</StatusPill>}
              </button>
              <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-2 py-1.5">
                {!completed && <button type="button" onClick={() => onUpdate(item.id, { status: active ? "completed" : "active", completed: active })} className={`rounded-lg px-3 py-1.5 text-[10px] font-semibold ${active ? "bg-brand-green-500 text-white" : "bg-brand-blue-500 text-white"}`}>{active ? "Završi" : "Pokreni"}</button>}
                <button type="button" onClick={() => onRemove(item.id)} className="h-7 w-7 rounded-lg text-red-300" aria-label="Ukloni iz kalendara">×</button>
              </div>
            </Panel>
          );
        })}
        {selectedItems.length === 0 && <EmptyState title="Nema plana za izabrani dan" />}
      </div>
    </div>
  );
}

function TemplateSummary({ item, meta }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex min-w-0 items-center gap-1.5"><b className="truncate text-xs font-semibold text-white">{item.name}</b><TemplateSourceBadge source={item.source} demo={item.demo} /></span>
      <span className="mt-0.5 block text-[10px] text-neutral-500">{meta}</span>
    </span>
  );
}

function TemplateSourceBadge({ source, demo = false }) {
  const trainer = source === "trainer";
  return <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-medium uppercase ${trainer ? "border-brand-green-500/25 bg-brand-green-500/10 text-brand-green-300" : "border-brand-blue-500/25 bg-brand-blue-500/10 text-brand-blue-300"}`}>{trainer ? (demo ? "Trener · primer" : "Trener") : "Moje"}</span>;
}

function useDialogLifecycle(onClose) {
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
}

function DetailsModal({ title, subtitle, zIndexClass = "z-[100]", onClose, children }) {
  useDialogLifecycle(onClose);
  return createPortal(
    <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/90 p-4`} onClick={onClose} role="presentation">
      <section role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()} className="flex h-[calc(100dvh-2rem)] max-h-[42rem] w-full max-w-md flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-2xl">
        <header className="flex shrink-0 items-start gap-3 border-b border-white/10 p-4">
          <div className="min-w-0 flex-1"><h2 className="truncate text-base font-semibold text-white">{title}</h2><p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p></div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-xl text-white" aria-label="Zatvori">×</button>
        </header>
        <ScrollArea containerClassName="min-h-0 flex-1 overflow-hidden" className="h-full space-y-2 p-3 pb-6" endShadowClassName="inset-x-0 bottom-0 h-10 bg-gradient-to-t from-neutral-900 via-neutral-900/80 to-transparent">{children}</ScrollArea>
      </section>
    </div>,
    document.body
  );
}

function TrainingDetails({ training, elevated = false, onOpenExercise, onClose }) {
  const blocks = normalizedTrainingBlocks(training);
  return (
    <DetailsModal title={training.name} subtitle={`${training.exercises.length} vežbi · ${training.focus}`} zIndexClass={elevated ? "z-[110]" : "z-[100]"} onClose={onClose}>
      {training.notes?.trim() && <div className="whitespace-pre-wrap rounded-xl border border-brand-blue-500/15 bg-brand-blue-500/[0.07] px-3 py-2.5 text-xs leading-relaxed text-neutral-300">{training.notes}</div>}
      {blocks.map((block, blockIndex) => {
        const items = training.exercises.filter((item) => exerciseBlockId(item, blocks) === block.id);
        if (items.length === 0) return null;
        return (
          <section key={block.id} className="overflow-hidden rounded-xl border border-white/10 bg-neutral-950/35">
            <div className="border-b border-white/[0.06] px-3 py-2 text-xs font-semibold text-white">{block.name}</div>
            <div className="space-y-1.5 p-2">
              {items.map((item, index) => {
                const exercise = getExerciseById(item.exerciseId);
                if (!exercise) return null;
                const weight = item.weight !== "" && item.weight !== undefined ? ` · ${item.weight}kg` : "";
                return (
                  <button key={`${item.exerciseId}-${index}`} type="button" onClick={() => onOpenExercise(exercise)} className="flex w-full items-center gap-3 rounded-lg bg-white/[0.035] p-2 text-left transition hover:bg-white/[0.06]">
                    <span className="relative h-12 w-14 shrink-0 overflow-hidden rounded-lg border border-white/[0.06] bg-[#090d15]">
                      <ExercisePose pose={exercise.pose} phase={index % 3} className="absolute inset-0 h-full w-full scale-125 text-neutral-500" />
                      <span className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-black/55 text-[8px] font-semibold text-neutral-300">{index + 1}</span>
                    </span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{exercise.name}</span><span className="mt-0.5 block text-[10px] text-neutral-500">{item.sets} serije · {item.reps} ponavljanja{weight} · {item.restSeconds}s odmor</span></span>
                    <span className="text-lg text-neutral-600">›</span>
                  </button>
                );
              })}
            </div>
            {blockIndex < blocks.length - 1 && <div className="border-t border-amber-400/15 bg-amber-400/[0.05] px-3 py-2 text-[10px] text-amber-200/75">Pauza {block.pauseSeconds}s</div>}
          </section>
        );
      })}
    </DetailsModal>
  );
}

function ProgramDetails({ program, trainings, onOpenTraining, onClose }) {
  const [activeWeek, setActiveWeek] = useState(0);
  const included = program.trainingIds.map((id) => trainings.find((training) => training.id === id)).filter(Boolean);
  const weekPlans = normalizedProgramWeeks(program);
  const effectiveWeek = Math.min(activeWeek, weekPlans.length - 1);
  const activePlan = weekPlans[effectiveWeek];
  const trainingDays = activePlan.days.filter((day) => day.trainingId).length;
  const hasSchedule = weekPlans.some((week) => week.days.some((day) => day.trainingId));
  return (
    <DetailsModal title={program.name} subtitle={`${program.weeks} nedelja · ${program.goal}`} onClose={onClose}>
      <section className="overflow-hidden rounded-xl border border-white/10 bg-neutral-950/35">
        <div className="border-b border-white/[0.06] p-2.5">
          <div className="mb-2 flex items-center justify-between px-0.5"><p className="text-xs font-semibold text-white">Nedelja {effectiveWeek + 1}</p><span className="text-[9px] text-neutral-500">{trainingDays} treninga · {7 - trainingDays} odmora</span></div>
          <ScrollArea orientation="horizontal" className="flex gap-1.5 pb-1" endShadowClassName="inset-y-0 right-0 w-9 bg-gradient-to-l from-neutral-950 via-neutral-950/80 to-transparent">
            {weekPlans.map((week) => <button key={week.weekIndex} type="button" onClick={() => setActiveWeek(week.weekIndex)} className={`h-8 w-10 shrink-0 rounded-lg text-[10px] font-semibold ${effectiveWeek === week.weekIndex ? "bg-brand-blue-500 text-white" : "bg-white/[0.05] text-neutral-500"}`}>{week.weekIndex + 1}</button>)}
          </ScrollArea>
        </div>
        {hasSchedule ? (
          <div className="divide-y divide-white/[0.05]">
            {activePlan.days.map((day) => {
              const training = trainings.find((item) => item.id === day.trainingId);
              if (!training) return <div key={day.dayIndex} className="flex items-center gap-3 px-3 py-2"><span className="w-20 shrink-0 text-[10px] font-medium text-neutral-500">{PROGRAM_DAYS[day.dayIndex]}</span><span className="min-w-0 flex-1 text-xs text-neutral-600">Odmor</span></div>;
              return <button key={day.dayIndex} type="button" onClick={() => onOpenTraining(training)} className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/[0.04]"><span className="w-20 shrink-0 text-[10px] font-medium text-neutral-500">{PROGRAM_DAYS[day.dayIndex]}</span><span className="min-w-0 flex-1 truncate text-xs font-medium text-white">{training.name}</span><span className="h-1.5 w-1.5 rounded-full bg-brand-green-400" /><span className="text-sm text-neutral-600">›</span></button>;
            })}
          </div>
        ) : <p className="px-3 py-4 text-center text-xs text-neutral-500">Raspored nije definisan.</p>}
      </section>
      <p className="px-1 pt-1 text-[10px] font-medium uppercase text-neutral-500">Treninzi u programu</p>
      {included.map((training, index) => <button key={training.id} type="button" onClick={() => onOpenTraining(training)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-neutral-950/45 p-3 text-left transition hover:bg-white/[0.04]"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-green-500/10 text-xs font-semibold text-brand-green-300">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{training.name}</span><span className="mt-0.5 block text-[10px] text-neutral-500">{training.exercises.length} vežbi · {training.focus}</span></span><span className="text-lg text-neutral-600">›</span></button>)}
      {included.length === 0 && <EmptyState title="Program nema dostupne treninge" />}
    </DetailsModal>
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

function ExerciseDetails({ exercise, canBuild, added, onAdd, onRemove, onClose }) {
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4" onClick={onClose} role="presentation">
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
            <button type="button" onClick={added ? onRemove : onAdd} className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${added ? "border border-red-400/25 bg-red-500/15 text-red-200" : "bg-brand-blue-500 shadow-glow"}`}>
              {added ? "Ukloni iz treninga" : "Dodaj u trening"}
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
