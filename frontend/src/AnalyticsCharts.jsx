import React, { useState } from "react";

const PALETTE = [
  "#EB0A1E", // Toyota Red
  "#002046", // Navy Blue
  "#2563EB", // Bright Blue
  "#059669", // Emerald Green
  "#D97706", // Amber
  "#7C3AED", // Violet
  "#DB2777", // Pink
  "#475569", // Slate Gray
];

export function ExecutiveKpiCards({ stats }) {
  return (
    <div className="kpi-grid">
      <div className="kpi-card">
        <div className="kpi-header">
          <span className="material-symbols-outlined kpi-icon">inventory_2</span>
          <span className="kpi-tag ok">Live Stock</span>
        </div>
        <div className="kpi-value">{stats.currentStock}</div>
        <div className="kpi-subtext">out of {stats.totalCapacity} total capacity</div>
        <div className="kpi-progress-bar">
          <div className="kpi-progress-fill" style={{ width: `${stats.overallUtilization}%` }} />
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-header">
          <span className="material-symbols-outlined kpi-icon">pie_chart</span>
          <span className="kpi-tag info">Utilization</span>
        </div>
        <div className="kpi-value">{stats.overallUtilization}%</div>
        <div className="kpi-subtext">Across {stats.yards.length} stockyards</div>
        <div className="kpi-badge-row">
          {stats.highRiskYards > 0 ? (
            <span className="badge warn">{stats.highRiskYards} yard(s) near limit</span>
          ) : (
            <span className="badge ok">All yards healthy</span>
          )}
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-header">
          <span className="material-symbols-outlined kpi-icon">schedule</span>
          <span className="kpi-tag neutral">Avg Dwell</span>
        </div>
        <div className="kpi-value">{stats.averageDwellDays} <small>days</small></div>
        <div className="kpi-subtext">Time spent parked in yard</div>
        <div className="kpi-badge-row">
          <span className="badge neutral">Target: &lt; 5 days</span>
        </div>
      </div>

      <div className={`kpi-card ${stats.openFlags > 0 ? "bad" : ""}`}>
        <div className="kpi-header">
          <span className="material-symbols-outlined kpi-icon">flag</span>
          <span className={`kpi-tag ${stats.openFlags > 0 ? "bad" : "ok"}`}>
            {stats.openFlags > 0 ? "Action Required" : "Clean"}
          </span>
        </div>
        <div className="kpi-value">{stats.openFlags}</div>
        <div className="kpi-subtext">Unresolved operational flags</div>
        <div className="kpi-badge-row">
          {stats.openFlags > 0 ? (
            <span className="badge bad">Pending review</span>
          ) : (
            <span className="badge ok">No issues</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ModelDonutChart({ models = [] }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const total = models.reduce((sum, m) => sum + m.count, 0);

  if (!models || models.length === 0 || total === 0) {
    return <div className="chart-empty">No vehicle model data available</div>;
  }

  let cumulativeAngle = 0;
  const radius = 70;
  const strokeWidth = 24;
  const center = 100;
  const circumference = 2 * Math.PI * radius;

  const slices = models.map((m, index) => {
    const pct = m.count / total;
    const strokeDasharray = `${pct * circumference} ${circumference}`;
    const strokeDashoffset = -cumulativeAngle * circumference;
    cumulativeAngle += pct;
    const color = PALETTE[index % PALETTE.length];

    return {
      ...m,
      pct: Math.round(pct * 100),
      color,
      strokeDasharray,
      strokeDashoffset,
      index,
    };
  });

  const active = hoverIndex !== null ? slices[hoverIndex] : null;

  return (
    <div className="chart-container">
      <div className="donut-wrapper">
        <svg viewBox="0 0 200 200" className="donut-svg">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />
          {slices.map((slice) => (
            <circle
              key={slice.model}
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke={slice.color}
              strokeWidth={hoverIndex === slice.index ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={slice.strokeDasharray}
              strokeDashoffset={slice.strokeDashoffset}
              transform={`rotate(-90 ${center} ${center})`}
              className="donut-segment"
              onMouseEnter={() => setHoverIndex(slice.index)}
              onMouseLeave={() => setHoverIndex(null)}
              style={{ transition: "stroke-width 0.2s ease, opacity 0.2s ease", cursor: "pointer" }}
            />
          ))}
          <text x={center} y={center - 6} textAnchor="middle" className="donut-center-val">
            {active ? active.count : total}
          </text>
          <text x={center} y={center + 14} textAnchor="middle" className="donut-center-lbl">
            {active ? active.model : "Total Units"}
          </text>
        </svg>
      </div>

      <div className="legend-grid">
        {slices.map((slice) => (
          <div
            key={slice.model}
            className={`legend-item ${hoverIndex === slice.index ? "active" : ""}`}
            onMouseEnter={() => setHoverIndex(slice.index)}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <span className="legend-dot" style={{ backgroundColor: slice.color }} />
            <span className="legend-name">{slice.model}</span>
            <span className="legend-count">{slice.count}</span>
            <span className="legend-pct">{slice.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function YardCapacityBarChart({ yards = [] }) {
  const [filter, setFilter] = useState("all"); // 'all' | 'high'
  const displayYards = filter === "high" ? yards.filter((y) => y.utilization >= 75) : yards;

  return (
    <div className="chart-container stack">
      <div className="chart-toolbar">
        <span className="chart-subtitle">Comparing vehicles parked vs maximum space</span>
        <div className="pill-toggle">
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All Yards ({yards.length})</button>
          <button className={filter === "high" ? "active" : ""} onClick={() => setFilter("high")}>High Utilization</button>
        </div>
      </div>

      <div className="bar-list">
        {displayYards.map((yard) => {
          const isCritical = yard.utilization >= 90;
          const isHeavy = yard.utilization >= 75 && yard.utilization < 90;
          const barColor = isCritical ? "#EB0A1E" : isHeavy ? "#D97706" : "#2563EB";

          return (
            <div key={yard.id} className="bar-row">
              <div className="bar-info">
                <span className="bar-label">{yard.name}</span>
                <span className="bar-code">{yard.code}</span>
              </div>
              <div className="bar-track-wrapper">
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.min(100, yard.utilization)}%`,
                      backgroundColor: barColor,
                    }}
                  />
                </div>
                <div className="bar-stats">
                  <strong>{yard.count}</strong> / {yard.capacity} units
                </div>
              </div>
              <div className={`bar-pct ${isCritical ? "bad" : isHeavy ? "warn" : "ok"}`}>
                {yard.utilization}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DwellDistributionChart({ dwellDistribution = {} }) {
  const entries = Object.entries(dwellDistribution);
  const maxVal = Math.max(1, ...entries.map(([, v]) => v));

  return (
    <div className="chart-container">
      <div className="vbar-chart">
        {entries.map(([label, count], index) => {
          const heightPct = Math.round((count / maxVal) * 100);
          const color = index >= 3 ? "#EB0A1E" : index === 2 ? "#D97706" : "#002046";

          return (
            <div key={label} className="vbar-col">
              <div className="vbar-value">{count}</div>
              <div className="vbar-track">
                <div
                  className="vbar-fill"
                  style={{
                    height: `${Math.max(6, heightPct)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <div className="vbar-label">{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FlagDistributionChart({ flags = [] }) {
  if (!flags || flags.length === 0) {
    return <div className="chart-empty">No active operational flags</div>;
  }

  const maxVal = Math.max(1, ...flags.map((f) => f.count));

  return (
    <div className="chart-container stack">
      <div className="hbar-list">
        {flags.map((item) => {
          const pct = Math.round((item.count / maxVal) * 100);
          return (
            <div key={item.type} className="hbar-row">
              <div className="hbar-label">{item.label}</div>
              <div className="hbar-track">
                <div className="hbar-fill" style={{ width: `${Math.max(8, pct)}%` }} />
              </div>
              <div className="hbar-count">{item.count}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DwellByModelChart({ dwellByModel = [] }) {
  if (!dwellByModel || dwellByModel.length === 0) {
    return <div className="chart-empty">No dwell data per model</div>;
  }

  const maxDays = Math.max(1, ...dwellByModel.map((d) => d.avgDays));

  return (
    <div className="chart-container stack">
      <div className="hbar-list">
        {dwellByModel.map((item) => {
          const pct = Math.round((item.avgDays / maxDays) * 100);
          return (
            <div key={item.model} className="hbar-row">
              <div className="hbar-label">
                <strong>{item.model}</strong>
                <small>({item.count} units)</small>
              </div>
              <div className="hbar-track">
                <div className="hbar-fill neutral" style={{ width: `${Math.max(10, pct)}%` }} />
              </div>
              <div className="hbar-count">{item.avgDays} days avg</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
