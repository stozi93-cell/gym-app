import { useState } from "react";
import TrainingCard from "../components/training/TrainingCard";

export default function AdminTrainingStudio() {
  const [trainings, setTrainings] = useState([]);

  function addTraining() {
    setTrainings((t) => [
      ...t,
      {
        id: crypto.randomUUID(),
        date: new Date().toLocaleDateString("sr-Latn-RS"),
        exercises: [],
        completed: false,
      },
    ]);
  }

  function updateTraining(id, updated) {
    setTrainings((t) =>
      t.map((tr) => (tr.id === id ? updated : tr))
    );
  }

  function deleteTraining(id) {
    setTrainings((t) => t.filter((tr) => tr.id !== id));
  }

  return (
    <div className="px-2 py-4 space-y-4">
      <h1 className="text-xl font-semibold text-white">
        Trening studio
      </h1>

      <button
        onClick={addTraining}
        className="rounded bg-blue-600 px-4 py-2 text-sm text-white"
      >
        + Novi trening
      </button>

      <div className="space-y-4">
        {trainings.map((t) => (
          <TrainingCard
            key={t.id}
            training={t}
            trainings={trainings}
            onUpdate={(u) => updateTraining(t.id, u)}
            onDelete={() => deleteTraining(t.id)}
          />
        ))}
      </div>
    </div>
  );
}
