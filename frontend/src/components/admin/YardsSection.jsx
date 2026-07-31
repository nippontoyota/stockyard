import React, { useMemo } from "react";
import { yardsByRegion } from "../../stockyardLogic.js";

const RISK_FILTERS = [
  { id: "all", label: "All yards" },
  { id: "critical", label: "Critical" },
  { id: "heavy", label: "Heavy load" },
];

export function YardsSection({ stats, yardSearch, setYardSearch, yardRiskFilter, setYardRiskFilter, flagsByYard, onSelectYard }) {
  const searchFilteredYards = useMemo(() => {
    const q = yardSearch.trim().toLowerCase();
    let list = stats.yards;
    if (yardRiskFilter === "critical") list = list.filter((y) => y.risk === "critical");
    else if (yardRiskFilter === "heavy") list = list.filter((y) => y.risk === "heavy" || y.risk === "critical");
    if (!q) return list;
    return list.filter(
      (yard) =>
        yard.name.toLowerCase().includes(q) ||
        yard.code.toLowerCase().includes(q) ||
        yard.id.toLowerCase().includes(q) ||
        (yard.city || "").toLowerCase().includes(q)
    );
  }, [stats.yards, yardSearch, yardRiskFilter]);

  const yardsGroupedByRegion = useMemo(() => {
    const ids = new Set(searchFilteredYards.map((yard) => yard.id));
    return yardsByRegion()
      .map(({ region, yards: regionYards }) => ({
        region,
        yards: regionYards.filter((yard) => ids.has(yard.id)),
      }))
      .filter((group) => group.yards.length > 0);
  }, [searchFilteredYards]);

  return (
    <div className="admin-section stack">
      <div className="admin-section-intro">
        <strong>
          {searchFilteredYards.length} yard{searchFilteredYards.length === 1 ? "" : "s"}
        </strong>
        <span>Search by name, code, or region. Tap a yard to open its vehicles.</span>
      </div>

      <div className="analytics-yards-toolbar">
        <div className="yard-search-wrap">
          <span className="material-symbols-outlined yard-search-icon" aria-hidden="true">
            search
          </span>
          <input
            id="analyticsYardSearch"
            type="search"
            className="yard-search-input"
            value={yardSearch}
            onChange={(e) => setYardSearch(e.target.value)}
            placeholder="Search by name, code, or region…"
            autoComplete="off"
            aria-label="Search yards"
          />
          {yardSearch && (
            <button type="button" className="yard-search-clear" onClick={() => setYardSearch("")} aria-label="Clear yard search">
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
        </div>
      </div>

      <div className="admin-filter-chips" role="group" aria-label="Yard risk filter">
        {RISK_FILTERS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={yardRiskFilter === chip.id ? "active" : ""}
            onClick={() => setYardRiskFilter(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {yardsGroupedByRegion.length === 0 ? (
        <div className="yard-picker-empty">
          <span className="material-symbols-outlined">location_off</span>
          <p>
            {yardSearch || yardRiskFilter !== "all"
              ? `No yards match your filters${yardSearch ? ` for “${yardSearch}”` : ""}.`
              : "No yards found."}
          </p>
        </div>
      ) : (
        yardsGroupedByRegion.map(({ region, yards: regionYards }) => (
          <section key={region} className="analytics-yards-region">
            <div className="analytics-yards-region-label">{region}</div>
            <div className="yard-box-grid">
              {regionYards.map((yard) => {
                const empty = Math.max(0, yard.capacity - yard.count);
                const openFlags = flagsByYard[yard.id] || 0;
                return (
                  <article
                    className={`yard-box clickable ${yard.risk === "critical" ? "risk-critical" : yard.risk === "heavy" ? "risk-heavy" : ""}`}
                    key={yard.id}
                    onClick={() => onSelectYard(yard)}
                    title={`View vehicles at ${yard.name}`}
                  >
                    <div className="yard-box-top">
                      <div>
                        <span className="eyebrow">{yard.code}</span>
                        <h2>{yard.name}</h2>
                      </div>
                      {openFlags > 0 && <span className="yard-flag-badge" title={`${openFlags} open flag${openFlags === 1 ? "" : "s"}`}>{openFlags}</span>}
                    </div>
                    <div className="yard-count">{yard.count}</div>
                    <div className="yard-box-metrics">
                      <span>
                        <b>{yard.count}</b>Utilised
                      </span>
                      <span>
                        <b>{empty}</b>Empty
                      </span>
                      <span>
                        <b>{yard.capacity}</b>Capacity
                      </span>
                    </div>
                    <div className="progress-wrapper">
                      <progress max="100" value={Math.min(100, yard.utilization)} />
                      <span className="progress-lbl">{yard.utilization}%</span>
                    </div>
                    <div className="yard-box-tap-hint">
                      <span className="material-symbols-outlined">directions_car</span>
                      <span>View vehicles</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
