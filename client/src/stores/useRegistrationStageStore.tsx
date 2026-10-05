import { create } from "zustand";
import type { RegistrationStageTypes } from "@/types";

type RegistrationStageStore = {
  currentStage: RegistrationStageTypes;
  nextStage: () => void;
  previousStage: () => void;
  resetStages: () => void;
};

const initialStages: RegistrationStageTypes[] = [
  "Confirmation",
  "ServiceDetails",
  "TableSelection",
  "ServiceSelection",
];
let stages: RegistrationStageTypes[] = [...initialStages];
let currentPath: RegistrationStageTypes[] = ["Home"];

// Отслеживает процесс регистрации. Управляет переключением экранов (стадий).
export const useRegistrationStageStore = create<RegistrationStageStore>(
  (set) => ({
    currentStage: currentPath[currentPath.length - 1],

    nextStage: () =>
      set((state) => {
        const nextStage = stages.pop();
        if (!nextStage) return { currentStage: state.currentStage };
        currentPath.push(nextStage);
        return { currentStage: currentPath[currentPath.length - 1] };
      }),

    previousStage: () =>
      set((state) => {
        if (currentPath.length <= 1) {
          return { currentStage: state.currentStage };
        }

        const previousStage = currentPath.pop();
        if (!previousStage) return { currentStage: state.currentStage };
        stages.push(previousStage);
        return { currentStage: currentPath[currentPath.length - 1] };
      }),

    resetStages: () =>
      set(() => {
        stages = [...initialStages];
        currentPath = ["Home"];
        return { currentStage: "Home" };
      }),
  })
);
