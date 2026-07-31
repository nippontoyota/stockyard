export const ADMIN_SECTIONS = [
  { id: "attention", label: "Attention", icon: "priority_high" },
  { id: "yards", label: "Yards", icon: "warehouse" },
  { id: "vehicles", label: "Vehicles", icon: "directions_car" },
  { id: "setup", label: "Setup", icon: "tune" },
];

export const SETUP_TABS = [
  { id: "notifications", label: "Alerts", icon: "notifications" },
  { id: "passwords", label: "Passwords", icon: "key" },
  { id: "branches", label: "Branches", icon: "store" },
];

export function getAdminSectionBadge(sectionId, { openFlags, transitCount }) {
  if (sectionId === "attention") return openFlags;
  if (sectionId === "vehicles") return transitCount;
  return 0;
}

export function adminSectionSubtitle(sectionId) {
  if (sectionId === "attention") return "Resolve exceptions and damage reports";
  if (sectionId === "yards") return "Browse yards by region and open vehicle lists";
  if (sectionId === "vehicles") return "Find, edit, and clean up vehicle records";
  if (sectionId === "setup") return "Passwords, branches, and push alerts";
  return "";
}
