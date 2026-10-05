import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { AnimatePresence, motion } from "motion/react";

import HomeStage from "./Stages/HomeStage";
import ServiceSelectionStage from "./Stages/ServiceSelectionStage";
import TableSelectionStage from "./Stages/TableSelectionStage";
import ServiceDetailsStage from "./Stages/ServiceDetailsStage";
import ConfirmationStage from "./Stages/ConfirmationStage";

export default function Home() {
  const { currentStage } = useRegistrationStageStore();

  return (
    <div className="">
      <AnimatePresence mode="popLayout">
        {currentStage === "Home" && (
          <motion.div
            key="home"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.25 }}
          >
            <HomeStage />
          </motion.div>
        )}

        {currentStage === "ServiceSelection" && (
          <motion.div
            key="service-selection"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.25 }}
          >
            <ServiceSelectionStage />
          </motion.div>
        )}

        {currentStage === "TableSelection" && (
          <motion.div
            key="table-selection"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.25 }}
          >
            <TableSelectionStage />
          </motion.div>
        )}

        {currentStage === "ServiceDetails" && (
          <motion.div
            key="service-details"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.25 }}
          >
            <ServiceDetailsStage />
          </motion.div>
        )}

        {currentStage === "Confirmation" && (
          <motion.div
            key="confirmation"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.25 }}
          >
            <ConfirmationStage />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
