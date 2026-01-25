// src/utils/trainingHelpers.js

export function getLastWeight(trainings, exerciseName) {
  for (const t of [...trainings].reverse()) {
    for (const ex of t.exercises || []) {
      if (ex.name === exerciseName) {
        return ex.sets?.[0]?.weight ?? null;
      }
    }
  }
  return null;
}
