import { AlertTriangle } from "lucide-react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProductionScheduleMilestone } from "@/types/domain";
import { daysBetween } from "@/utils/date";
import { formatDate } from "@/utils/format";

interface ScheduleRow {
  key: string;
  label: string;
  offset: number;
  duration: number;
  isBlocked: boolean;
  blockerReasons: string[];
  startDate: string;
  endDate: string;
}

function ScheduleTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScheduleRow }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{row.label}</strong>
      <div>{formatDate(row.startDate)} - {formatDate(row.endDate)}</div>
      {row.isBlocked ? <div className="danger-text">Blocked: {row.blockerReasons.join(" ")}</div> : null}
    </div>
  );
}

/**
 * Gantt-style milestone chart. Recharts has no native Gantt type, so this uses the
 * standard "invisible spacer bar + visible duration bar" stacked-bar technique:
 * each row gets a transparent bar sized to the milestone's offset from the anchor
 * date, followed by a colored bar sized to its duration.
 */
export function ProductionScheduleChart({
  title,
  milestones,
  requiredArrivalDate,
}: {
  title: string;
  milestones: ProductionScheduleMilestone[];
  requiredArrivalDate: string | null;
}) {
  if (!milestones.length) {
    return (
      <div className="panel">
        <div className="panel-header"><h3>{title}</h3></div>
        <div className="empty-state">No schedule milestones yet. Run a simulation to generate the production timeline.</div>
      </div>
    );
  }

  const anchor = milestones[0].startDate;
  const data = milestones.map((milestone) => ({
    key: milestone.key,
    label: milestone.label,
    offset: Math.max(daysBetween(anchor, milestone.startDate), 0),
    duration: Math.max(daysBetween(milestone.startDate, milestone.endDate) + 1, 1),
    isBlocked: milestone.isBlocked,
    blockerReasons: milestone.blockerReasons,
    startDate: milestone.startDate,
    endDate: milestone.endDate,
  }));

  const requiredArrivalOffset = requiredArrivalDate ? Math.max(daysBetween(anchor, requiredArrivalDate), 0) : null;

  return (
    <div className="panel">
      <div className="panel-header"><h3>{title}</h3></div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
            <XAxis type="number" label={{ value: "Days from order date", position: "insideBottom", offset: -4, fontSize: 11 }} />
            <YAxis type="category" dataKey="label" width={110} />
            <Tooltip content={<ScheduleTooltip />} />
            {requiredArrivalOffset !== null ? (
              <ReferenceLine
                x={requiredArrivalOffset}
                stroke="#e72027"
                strokeDasharray="4 4"
                label={{ value: "Required arrival", position: "top", fontSize: 10, fill: "#e72027" }}
              />
            ) : null}
            <Bar dataKey="offset" stackId="schedule" fill="transparent" />
            <Bar dataKey="duration" stackId="schedule" radius={[4, 4, 4, 4]}>
              {data.map((row) => (
                <Cell key={row.key} fill={row.isBlocked ? "#e72027" : "#2958b3"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="cell-stack">
        {data.filter((row) => row.isBlocked).map((row) => (
          <span key={row.key} className="helper-text schedule-blocker-note">
            <AlertTriangle size={13} aria-hidden /> {row.label} blocked: {row.blockerReasons.join(" ")}
          </span>
        ))}
      </div>
      <p className="chart-text-summary">
        Milestones run from {formatDate(milestones[0].startDate)} through {formatDate(milestones.at(-1)?.endDate ?? milestones[0].endDate)}.
        {data.some((row) => row.isBlocked) ? " One or more milestones are blocked pending readiness items." : " No readiness blockers detected."}
      </p>
    </div>
  );
}
