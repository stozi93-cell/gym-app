import { getLastWeight } from "../../utils/trainingHelpers";

export default function ExerciseEditor({
  exercise,
  onChange,
  onRemove,
  disabled,
  trainings,
}) {
  const lastWeight = getLastWeight(trainings, exercise.name);

  return (
    <div className="rounded-lg bg-neutral-800 p-3 space-y-2">
      <div className="flex justify-between items-center">
        <p className="font-medium text-white">
          {exercise.name}
          {lastWeight !== null && (
            <span className="ml-2 text-xs text-neutral-400">
              poslednji put: {lastWeight}kg
            </span>
          )}
        </p>

        {!disabled && (
          <button
            onClick={onRemove}
            className="text-xs text-red-400"
          >
            Ukloni
          </button>
        )}
      </div>

      {exercise.sets.map((set, i) => (
        <div key={i} className="flex gap-2 text-sm">
          <input
            type="number"
            value={set.reps}
            disabled={disabled}
            onChange={(e) => {
              const sets = [...exercise.sets];
              sets[i].reps = Number(e.target.value);
              onChange({ ...exercise, sets });
            }}
            className="w-16 rounded bg-neutral-700 px-2 py-1"
            placeholder="reps"
          />

          <input
            type="number"
            value={set.weight}
            disabled={disabled}
            onChange={(e) => {
              const sets = [...exercise.sets];
              sets[i].weight = Number(e.target.value);
              onChange({ ...exercise, sets });
            }}
            className="w-20 rounded bg-neutral-700 px-2 py-1"
            placeholder="kg"
          />
        </div>
      ))}
    </div>
  );
}
