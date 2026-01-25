// src/data/trainingTemplates.js

export const TRAINING_TEMPLATES = [
  {
    id: "lower_strength",
    name: "Lower – Strength",
    exercises: [
      {
        name: "Back Squat",
        sets: [
          { reps: 5, weight: 0 },
          { reps: 5, weight: 0 },
          { reps: 5, weight: 0 },
        ],
      },
      {
        name: "RDL",
        sets: [
          { reps: 8, weight: 0 },
          { reps: 8, weight: 0 },
        ],
      },
    ],
  },
  {
    id: "upper_push",
    name: "Upper – Push",
    exercises: [
      {
        name: "Bench Press",
        sets: [
          { reps: 5, weight: 0 },
          { reps: 5, weight: 0 },
        ],
      },
      {
        name: "Shoulder Press",
        sets: [{ reps: 8, weight: 0 }],
      },
    ],
  },
];
