import test from "node:test";
import assert from "node:assert/strict";
import {
  EXERCISE_CATEGORIES,
  EXERCISE_EQUIPMENT,
  EXERCISES,
  getExerciseById,
} from "../src/data/exerciseCatalog.js";

test("exercise catalog has unique ids and complete coaching content", () => {
  assert.equal(new Set(EXERCISES.map((exercise) => exercise.id)).size, EXERCISES.length);
  assert.ok(EXERCISES.length >= 12);

  EXERCISES.forEach((exercise) => {
    assert.ok(exercise.name);
    assert.ok(exercise.pose);
    assert.ok(exercise.primaryMuscles.length > 0);
    assert.ok(exercise.steps.length >= 3);
    assert.ok(exercise.cues.length >= 3);
    assert.ok(exercise.mistakes.length >= 3);
    assert.equal(getExerciseById(exercise.id), exercise);
  });
});

test("every exercise uses a visible category and equipment filter", () => {
  const categories = new Set(EXERCISE_CATEGORIES.map((item) => item.value));
  const equipment = new Set(EXERCISE_EQUIPMENT.map((item) => item.value));

  EXERCISES.forEach((exercise) => {
    assert.ok(categories.has(exercise.category));
    assert.ok(equipment.has(exercise.equipment));
  });
});
