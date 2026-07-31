import { useEffect } from "react";
import { ADMIN_SECTIONS, SETUP_TABS } from "./adminSections.js";

const VALID_SECTIONS = new Set(ADMIN_SECTIONS.map((s) => s.id));
const VALID_FILTERS = new Set(["all", "damage", "exceptions"]);
const VALID_RISK = new Set(["all", "critical", "heavy"]);
const VALID_SETUP = new Set(SETUP_TABS.map((t) => t.id));

function readAdminParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    section: params.get("section"),
    filter: params.get("filter"),
    risk: params.get("risk"),
    setup: params.get("setup"),
  };
}

export function useAdminDeepLink({ section, issueFilter, yardRiskFilter, setupTab, setSection, setIssueFilter, setYardRiskFilter, setSetupTab }) {
  useEffect(() => {
    const { section: s, filter, risk, setup } = readAdminParams();
    if (s && VALID_SECTIONS.has(s)) setSection(s);
    if (filter && VALID_FILTERS.has(filter)) setIssueFilter(filter);
    if (risk && VALID_RISK.has(risk)) setYardRiskFilter(risk);
    if (setup && VALID_SETUP.has(setup)) setSetupTab(setup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (section && section !== "attention") params.set("section", section);
    else if (section === "attention") params.set("section", "attention");

    if (section === "attention" && issueFilter && issueFilter !== "all") {
      params.set("filter", issueFilter);
    }
    if (section === "yards" && yardRiskFilter && yardRiskFilter !== "all") {
      params.set("risk", yardRiskFilter);
    }
    if (section === "setup" && setupTab && setupTab !== "notifications") {
      params.set("setup", setupTab);
    }

    const qs = params.toString();
    const path = window.location.pathname;
    const next = qs ? `${path}?${qs}` : path;
    const current = path + window.location.search;
    if (current !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [section, issueFilter, yardRiskFilter, setupTab]);
}
