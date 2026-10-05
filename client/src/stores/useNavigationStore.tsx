import { create } from "zustand";
import type { AdminSectionTypes, PageTypes } from "@/types";

type NavigationStore = {
  activePage: PageTypes;
  adminSection: AdminSectionTypes;
  setActivePage: (tab: PageTypes) => void;
  setAdminSection: (section: AdminSectionTypes) => void;
};

export const useNavigationStore = create<NavigationStore>((set) => ({
  activePage: "Home",
  adminSection: "Reservations",
  setActivePage: (page: PageTypes) =>
    set((state) => ({
      activePage: page,
      adminSection: page === "Admin" ? "Reservations" : state.adminSection,
    })),
  setAdminSection: (section: AdminSectionTypes) =>
    set({ adminSection: section }),
}));
