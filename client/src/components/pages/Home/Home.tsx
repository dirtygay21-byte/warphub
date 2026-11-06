import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import type { RegistrationStageTypes } from "@/types";
import { AnimatePresence, motion, type Variants } from "motion/react";
import type { ComponentType } from "react";

import HomeStage from "./Stages/HomeStage";
import ServiceSelectionStage from "./Stages/ServiceSelectionStage";
import TableSelectionStage from "./Stages/TableSelectionStage";
import ServiceDetailsStage from "./Stages/ServiceDetailsStage";
import ConfirmationStage from "./Stages/ConfirmationStage";

const STAGES: Partial<Record<RegistrationStageTypes, { key: string; Component: ComponentType; className?: string }>> = {
  Home: { key: "home", Component: HomeStage },
  ServiceSelection: { key: "service-selection", Component: ServiceSelectionStage, className: "lg:mx-auto lg:max-w-3xl" },
  TableSelection: { key: "table-selection", Component: TableSelectionStage, className: "lg:mx-auto lg:max-w-3xl" },
  ServiceDetails: { key: "service-details", Component: ServiceDetailsStage, className: "lg:mx-auto lg:max-w-3xl" },
  Confirmation: { key: "confirmation", Component: ConfirmationStage, className: "lg:mx-auto lg:max-w-3xl" },
};

/**
 * Шаги записи: вперёд — новый шаг въезжает справа, назад — слева (direction из стора).
 * Время и замедление — токены движения (docs/design-code.md §7): --motion-base, --ease-out-soft.
 */
const EASE_OUT_SOFT = [0.2, 0.8, 0.2, 1] as const;
const stepVariants: Variants = {
  enter: (direction: 1 | -1) => ({ x: direction > 0 ? "100%" : "-100%" }),
  center: { x: 0 },
  exit: (direction: 1 | -1) => ({ x: direction > 0 ? "-100%" : "100%" }),
};

export default function Home() {
  const { currentStage, direction } = useRegistrationStageStore();
  const stage = STAGES[currentStage];

  return (
    <div className="">
      <AnimatePresence mode="popLayout" custom={direction} initial={false}>
        {stage && (
          <motion.div
            key={stage.key}
            className={stage.className}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: EASE_OUT_SOFT }}
          >
            <stage.Component />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
