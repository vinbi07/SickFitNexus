import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { dashboardService } from "@/services/dashboardService";
import type { DashboardSnapshot, ProductionStageName } from "@/types/domain";
import { addDays, daysBetween, toDateInput } from "@/utils/date";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";
import { RetailPoMap } from "@/components/dashboard/map/RetailPoMap";
import { SupplyChainMap } from "@/components/dashboard/map/SupplyChainMap";
import { OrderChainBar } from "@/components/dashboard/map/OrderChainBar";
import { stageTone } from "@/utils/supplyChainMap";
import { STATE_COORDINATES, STATE_NAMES } from "@/lib/usStates";
import { PRODUCTION_STAGES } from "@/utils/productionStage";
import { buildOrderChain } from "@/utils/orderChain";

type MapPoint = DashboardSnapshot["poMapPoints"][number];
type ChannelRow = DashboardSnapshot["wholesaleChannelRows"][number];
type StatusRow = DashboardSnapshot["poStatusCounts"][number];
type AccountRow = DashboardSnapshot["wholesaleAccounts"][number];
type UrgentAction = {
  id: string;
  label: string;
  title: string;
  meta: string;
  tone: "danger" | "warning" | "success" | "info";
  to: string;
};

const PREVIEW_MAP_POINTS: MapPoint[] = [
  {
    poId: "preview-po-1",
    poNumber: "DEMO-1048",
    account: "Preview Northeast Account",
    city: "Boston",
    state: "MA",
    status: "In Transit",
    sourceChannel: "Wholesale preview",
    value: 42000,
    units: 1800,
  },
  {
    poId: "preview-po-2",
    poNumber: "DEMO-1062",
    account: "Sample Campus Bookstore",
    city: "Austin",
    state: "TX",
    status: "Delayed",
    sourceChannel: "Wholesale preview",
    value: 28000,
    units: 920,
  },
  {
    poId: "preview-po-3",
    poNumber: "DEMO-1080",
    account: "Demo Health Retailer",
    city: "Phoenix",
    state: "AZ",
    status: "Pending Approval",
    sourceChannel: "Wholesale preview",
    value: 18500,
    units: 620,
  },
  {
    poId: "preview-po-4",
    poNumber: "DEMO-1091",
    account: "Preview Stadium Shop",
    city: "Atlanta",
    state: "GA",
    status: "Ordered",
    sourceChannel: "Wholesale preview",
    value: 35000,
    units: 1250,
  },
  {
    poId: "preview-po-5",
    poNumber: "DEMO-1104",
    account: "Sample Western Chain",
    city: "Seattle",
    state: "WA",
    status: "In Transit",
    sourceChannel: "Wholesale preview",
    value: 24500,
    units: 760,
  },
];

const PREVIEW_ACCOUNTS: AccountRow[] = [
  {
    retailerId: "preview-account-1",
    retailer: "Preview Northeast Account",
    openInvoices: 3,
    shippedInvoices: 1,
    recentPoCount: 4,
    nextWindow: "Demo reorder window",
  },
  {
    retailerId: "preview-account-2",
    retailer: "Sample Campus Bookstore",
    openInvoices: 1,
    shippedInvoices: 2,
    recentPoCount: 3,
    nextWindow: "Demo review needed",
  },
  {
    retailerId: "preview-account-3",
    retailer: "Demo Health Retailer",
    openInvoices: 2,
    shippedInvoices: 0,
    recentPoCount: 2,
    nextWindow: "Demo active lane",
  },
];

const PREVIEW_CHANNELS: ChannelRow[] = [
  { channel: "Wholesale preview", count: 5, value: 148000 },
  { channel: "Field sales preview", count: 3, value: 73000 },
  { channel: "Distributor preview", count: 2, value: 42000 },
];

// Synthetic factory orders so the supply-chain view and its milestone bar can be demoed.
const previewDay = (offset: number) => toDateInput(addDays(new Date(), offset));

function previewSupplyOrder(
  poId: string,
  poNumber: string,
  units: number,
  shipMode: "Sea" | "Air",
  actual: Partial<Record<ProductionStageName, number>>,
  planned: Partial<Record<ProductionStageName, number>>,
  late = false,
): DashboardSnapshot["supplyChainOrders"][number] {
  const toDates = (offsets: Partial<Record<ProductionStageName, number>>) =>
    Object.fromEntries(Object.entries(offsets).map(([stage, offset]) => [stage, previewDay(offset as number)])) as Partial<
      Record<ProductionStageName, string>
    >;
  const chain = buildOrderChain(toDates(actual), toDates(planned));
  const reached = [...chain].reverse().find((milestone) => milestone.date) ?? null;
  const upcoming = chain.find((milestone, index) => !milestone.date && index > chain.indexOf(reached ?? chain[0]));
  return {
    poId,
    poNumber,
    account: poNumber,
    manufacturer: "Sample Factory",
    units,
    shipMode,
    stage: reached?.stage ?? null,
    shippedDate: chain[4].date,
    expectedAtPort: chain[6].date ?? chain[6].expected,
    nextStage: upcoming?.stage ?? null,
    nextStageDate: upcoming?.expected ?? null,
    late,
    chain,
  };
}

const PREVIEW_SUPPLY_ORDERS: DashboardSnapshot["supplyChainOrders"] = [
  previewSupplyOrder(
    "preview-mo-1",
    "DEMO-260912",
    2400,
    "Sea",
    { "Sent to vendor": -52, Paid: -47, "In production": -46, Packing: -21, Shipped: -16 },
    { "At US port": 19, Received: 26 },
  ),
  previewSupplyOrder(
    "preview-mo-2",
    "DEMO-260723",
    1200,
    "Air",
    { "Sent to vendor": -40, Paid: -36, "In production": -35, Packing: -9, Shipped: -4 },
    { "At US port": 6, Received: 10 },
  ),
  previewSupplyOrder(
    "preview-mo-3",
    "DEMO-OCTOBER",
    3000,
    "Sea",
    { "Sent to vendor": -30, Paid: -26, "In production": -25 },
    { Packing: -3, Shipped: 2, "At US port": 37, Received: 44 },
    true,
  ),
  previewSupplyOrder(
    "preview-mo-4",
    "DEMO-260519",
    1800,
    "Air",
    { "Sent to vendor": -80, "Labels created": -22, Received: -3 },
    {},
  ),
];

/** Typical days per step for the preview, standing in for real order history. */
const PREVIEW_STEP_AVERAGES = [5, 2, 25, 5, 18, 9, 4];

const PREVIEW_STATUSES: StatusRow[] = [
  { status: "In Transit", count: 1 },
  { status: "Delayed", count: 1 },
  { status: "Pending Approval", count: 1 },
  { status: "Ordered", count: 1 },
  { status: "Shipped", count: 1 },
];

function normalizeState(value: string | null) {
  if (!value) return null;
  const clean = value.trim().toUpperCase();
  if (clean.length === 2 && STATE_COORDINATES[clean]) return clean;
  return STATE_NAMES[clean] ?? null;
}

function getStatusTone(status: string) {
  const clean = status.toLowerCase();
  if (
    clean.includes("delayed") ||
    clean.includes("danger") ||
    clean.includes("critical")
  )
    return "danger";
  if (
    clean.includes("pending") ||
    clean.includes("hold") ||
    clean.includes("open") ||
    clean.includes("warning")
  )
    return "warning";
  if (
    clean.includes("shipped") ||
    clean.includes("route") ||
    clean.includes("ordered") ||
    clean.includes("healthy")
  )
    return "success";
  return "info";
}

type ShippedUnitsPeriod = "week" | "month" | "3months" | "custom";

const SHIPPED_UNITS_PERIOD_LABELS: Record<ShippedUnitsPeriod, string> = {
  week: "this week",
  month: "this month",
  "3months": "last 3 months",
  custom: "selected range",
};

const SHIPPED_UNITS_PERIOD_DAYS: Record<
  Exclude<ShippedUnitsPeriod, "custom">,
  number
> = {
  week: 7,
  month: 30,
  "3months": 90,
};

function sumLedgerUnits(
  ledger: DashboardSnapshot["shippedUnitsLedger"],
  start: string,
  end: string,
) {
  return ledger
    .filter((entry) => entry.shipDate >= start && entry.shipDate <= end)
    .reduce((sum, entry) => sum + entry.units, 0);
}

function CommandSupportMetric({
  label,
  value,
  note,
  to,
  detail,
}: {
  label: string;
  value: string;
  note: string;
  to: string;
  detail?: ReactNode;
}) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="command-support-metric">
      <Link className="command-support-metric-link" to={to}>
        <span>{label}</span>
        <strong>{value}</strong>
        <em>{note}</em>
      </Link>
      {detail && (
        <>
          <button
            type="button"
            className="command-support-detail-toggle"
            onClick={() => setShowDetail((open) => !open)}
          >
            {showDetail ? "Hide detail" : "Show detail"}
          </button>
          {showDetail && (
            <div className="command-support-detail-panel">{detail}</div>
          )}
        </>
      )}
    </div>
  );
}

function CommandMetricStrip({ data }: { data: DashboardSnapshot }) {
  const [period, setPeriod] = useState<ShippedUnitsPeriod>("week");
  const [customRange, setCustomRange] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [menuView, setMenuView] = useState<"closed" | "list" | "calendar">(
    "closed",
  );
  const [calendarSelection, setCalendarSelection] = useState<
    DateRange | undefined
  >(undefined);
  const [showDetail, setShowDetail] = useState(false);

  const today = toDateInput(new Date());
  const ledgerMinDate = toDateInput(addDays(new Date(), -400));

  const range = useMemo(() => {
    if (period === "custom" && customRange) return customRange;
    const days =
      SHIPPED_UNITS_PERIOD_DAYS[period === "custom" ? "week" : period];
    return { start: toDateInput(addDays(new Date(), -(days - 1))), end: today };
  }, [period, customRange, today]);

  const shippedMetrics = useMemo(() => {
    const rangeDays = Math.max(daysBetween(range.start, range.end) + 1, 1);
    const priorEnd = toDateInput(addDays(new Date(range.start), -1));
    const priorStart = toDateInput(addDays(new Date(range.start), -rangeDays));
    const avgWindowStart = toDateInput(
      addDays(new Date(range.start), -rangeDays * 4),
    );

    const currentTotal = sumLedgerUnits(
      data.shippedUnitsLedger,
      range.start,
      range.end,
    );
    const priorTotal = sumLedgerUnits(
      data.shippedUnitsLedger,
      priorStart,
      priorEnd,
    );
    const trailingAverage = Math.round(
      sumLedgerUnits(data.shippedUnitsLedger, avgWindowStart, priorEnd) / 4,
    );
    const deltaPercent =
      priorTotal > 0
        ? Math.round(((currentTotal - priorTotal) / priorTotal) * 100)
        : currentTotal > 0
          ? 100
          : 0;
    const rows = data.shippedUnitsLedger
      .filter(
        (entry) => entry.shipDate >= range.start && entry.shipDate <= range.end,
      )
      .sort((left, right) => right.shipDate.localeCompare(left.shipDate));

    return { currentTotal, trailingAverage, deltaPercent, rows };
  }, [data.shippedUnitsLedger, range]);

  const shippedDeltaLabel = `${shippedMetrics.deltaPercent > 0 ? "+" : ""}${shippedMetrics.deltaPercent}% vs prior period`;

  const selectPeriod = (next: Exclude<ShippedUnitsPeriod, "custom">) => {
    setPeriod(next);
    setMenuView("closed");
  };

  return (
    <section className="command-strip-v2">
      <div className="command-hero-metric">
        <div className="command-hero-label-row">
          <span>Units shipped {SHIPPED_UNITS_PERIOD_LABELS[period]}</span>
          <button
            type="button"
            className="command-hero-period-icon"
            aria-label="Change time range"
            onClick={() =>
              setMenuView((view) => (view === "closed" ? "list" : "closed"))
            }
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <circle
                cx="8"
                cy="8"
                r="6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <path
                d="M8 4.5V8l2.6 1.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <Link className="command-hero-metric-link" to="/purchase-orders">
          <strong>{formatNumber(shippedMetrics.currentTotal)} Pairs</strong>
          <em>
            {shippedDeltaLabel} · 4x avg{" "}
            {formatNumber(shippedMetrics.trailingAverage)}
          </em>
        </Link>

        {menuView === "list" && (
          <div
            className="command-hero-calendar-popover command-hero-period-menu"
            role="menu"
            aria-label="Units shipped time range"
          >
            <button
              type="button"
              className={period === "week" ? "is-active" : ""}
              onClick={() => selectPeriod("week")}
            >
              Week
            </button>
            <button
              type="button"
              className={period === "month" ? "is-active" : ""}
              onClick={() => selectPeriod("month")}
            >
              Month
            </button>
            <button
              type="button"
              className={period === "3months" ? "is-active" : ""}
              onClick={() => selectPeriod("3months")}
            >
              3 Months
            </button>
            <button
              type="button"
              className={period === "custom" ? "is-active" : ""}
              onClick={() => {
                setPeriod("custom");
                setMenuView("calendar");
              }}
            >
              Custom…
            </button>
          </div>
        )}

        {menuView === "calendar" && (
          <div className="command-hero-calendar-popover">
            <DayPicker
              mode="range"
              min={1}
              selected={calendarSelection}
              defaultMonth={new Date()}
              disabled={{
                before: new Date(`${ledgerMinDate}T00:00:00`),
                after: new Date(`${today}T00:00:00`),
              }}
              onSelect={(nextRange) => {
                setCalendarSelection(nextRange);
                if (nextRange?.from && nextRange?.to) {
                  setCustomRange({
                    start: toDateInput(nextRange.from),
                    end: toDateInput(nextRange.to),
                  });
                  setMenuView("closed");
                }
              }}
            />
          </div>
        )}

        <button
          type="button"
          className="command-hero-detail-toggle"
          onClick={() => setShowDetail((open) => !open)}
        >
          {showDetail ? "Hide detail" : "Show detail"}
        </button>

        {showDetail && (
          <div className="command-hero-detail-panel">
            {shippedMetrics.rows.length ? (
              <table>
                <thead>
                  <tr>
                    <th>From</th>
                    <th>Date</th>
                    <th>Source</th>
                    <th>Pairs</th>
                  </tr>
                </thead>
                <tbody>
                  {shippedMetrics.rows.map((row) => (
                    <tr key={row.poId}>
                      <td>
                        <Link to={`/purchase-orders/${row.poId}`}>
                          {row.partner}
                        </Link>
                      </td>
                      <td>{formatDate(row.shipDate)}</td>
                      <td>
                        {row.source === "shipped"
                          ? "Shipped"
                          : "Ordered (est.)"}
                      </td>
                      <td>{formatNumber(row.units)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No purchase orders in this range.</p>
            )}
          </div>
        )}
      </div>
      <div className="command-support-metrics">
        <CommandSupportMetric
          label="Open wholesale POs"
          value={formatNumber(data.activeWholesalePipelineCount)}
          note={formatCurrency(data.activeWholesalePipelineValue)}
          to="/purchase-orders"
          detail={
            data.openWholesalePipelineLedger.length ? (
              <table>
                <thead>
                  <tr>
                    <th>From</th>
                    <th>PO</th>
                    <th>Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.openWholesalePipelineLedger.map((row) => (
                    <tr key={row.poId}>
                      <td>
                        <Link to={`/purchase-orders/${row.poId}`}>
                          {row.partner}
                        </Link>
                      </td>
                      <td>{row.poNumber}</td>
                      <td>{formatCurrency(row.value)}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No open wholesale purchase orders.</p>
            )
          }
        />
        <CommandSupportMetric
          label="PO Action"
          value={formatNumber(data.latePurchaseOrders.length)}
          note="Late or delayed"
          to="/purchase-orders"
          detail={
            data.latePurchaseOrders.length ? (
              <table>
                <thead>
                  <tr>
                    <th>From</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th>Days late</th>
                  </tr>
                </thead>
                <tbody>
                  {data.latePurchaseOrders.map((row) => (
                    <tr key={row.poId}>
                      <td>
                        <Link to={`/purchase-orders/${row.poId}`}>
                          {row.partner}
                        </Link>
                      </td>
                      <td>{formatDate(row.etaDate)}</td>
                      <td>{row.status}</td>
                      <td>{row.daysLate ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No late or delayed purchase orders.</p>
            )
          }
        />
        <CommandSupportMetric
          label="Incoming inventory"
          value={formatNumber(data.incomingInventoryUnits)}
          note={`${data.activeSkusInRoute} SKUs in route`}
          to="/production"
        />
        <CommandSupportMetric
          label="Wholesale revenue"
          value={formatCurrency(data.wholesaleRevenueTotal)}
          note={`${data.revenuePaceDeltaPercent >= 0 ? "+" : ""}${data.revenuePaceDeltaPercent}% pace`}
          to="/reports"
        />
      </div>
    </section>
  );
}

function buildMapRegions(points: MapPoint[]) {
  const regions = new Map<
    string,
    {
      state: string;
      count: number;
      value: number;
      units: number;
      firstPoint: MapPoint;
      tone: string;
    }
  >();
  points.forEach((point) => {
    const state = normalizeState(point.state);
    if (!state) return;
    const current = regions.get(state) ?? {
      state,
      count: 0,
      value: 0,
      units: 0,
      firstPoint: point,
      tone: getStatusTone(point.status),
    };
    current.count += 1;
    current.value += Number(point.value ?? 0);
    current.units += Number(point.units ?? 0);
    if (getStatusTone(point.status) === "danger") current.tone = "danger";
    else if (
      current.tone !== "danger" &&
      getStatusTone(point.status) === "warning"
    )
      current.tone = "warning";
    regions.set(state, current);
  });
  return [...regions.values()].sort((left, right) => right.value - left.value);
}

function buildPoUrgentActions(data: DashboardSnapshot): UrgentAction[] {
  const today = new Date();
  return data.latePurchaseOrders.slice(0, 3).map((po) => ({
    id: `po-action-${po.poId}`,
    label: po.status === "Delayed" ? "LATE / DELAYED" : "LATE ETA",
    title: po.poNumber,
    meta: `${getPoUrgencyReason(po.etaDate, today)} | ${po.partner}`,
    tone: "danger" as const,
    to: `/purchase-orders/${po.poId}`,
  }));
}

function getPoUrgencyReason(etaDate: string | null, today: Date) {
  if (!etaDate) return "Missing ETA";
  const eta = new Date(`${etaDate}T00:00:00`);
  const todayDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const daysLate = Math.floor((todayDate.getTime() - eta.getTime()) / 86400000);
  if (daysLate > 0) return `${daysLate} day${daysLate === 1 ? "" : "s"} late`;
  if (daysLate === 0) return "Due today";
  return `ETA ${formatDate(etaDate)}`;
}

type MapView = "supply" | "retail";

const SUPPLY_TONE_ORDER = { transit: 0, production: 1, waiting: 2, received: 3 } as const;

const MAP_VIEW_KEY = "nexus-dashboard-map-view";

function readMapView(): MapView {
  try {
    return window.localStorage.getItem(MAP_VIEW_KEY) === "retail" ? "retail" : "supply";
  } catch {
    return "supply";
  }
}

const MAP_VIEW_COPY: Record<MapView, { title: string; description: string }> = {
  supply: {
    title: "Where everything is",
    description: "Factory orders on their way from the factory to the warehouse.",
  },
  retail: {
    title: "Where the POs are going",
    description: "Open wholesale POs, account movement and regional action signals.",
  },
};

function PoCommandMap({ data }: { data: DashboardSnapshot }) {
  const [previewMode, setPreviewMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [view, setView] = useState<MapView>(readMapView);
  const liveActions = useMemo(() => buildPoUrgentActions(data), [data]);
  const points = previewMode ? PREVIEW_MAP_POINTS : data.poMapPoints;
  const navigate = useNavigate();
  // Moving orders first, then production, waiting, and recent arrivals, matching how the chain bar reads.
  const supplyOrders = [...(previewMode ? PREVIEW_SUPPLY_ORDERS : data.supplyChainOrders)].sort(
    (left, right) => SUPPLY_TONE_ORDER[stageTone(left.stage)] - SUPPLY_TONE_ORDER[stageTone(right.stage)],
  );
  const stepAverages = previewMode ? PREVIEW_STEP_AVERAGES : data.supplyChainStepAverages;
  const [pickedOrderId, setPickedOrderId] = useState<string | null>(null);
  const selectedOrderId = supplyOrders.some((order) => order.poId === pickedOrderId)
    ? pickedOrderId
    : (supplyOrders[0]?.poId ?? null);
  const accounts = previewMode ? PREVIEW_ACCOUNTS : data.wholesaleAccounts;
  const channels = previewMode ? PREVIEW_CHANNELS : data.wholesaleChannelRows;
  const retailStatuses = previewMode ? PREVIEW_STATUSES : data.poStatusCounts;
  // On the supply view the status card counts factory orders by production stage.
  const stageStatuses: StatusRow[] = PRODUCTION_STAGES.map((stage) => ({
    status: stage,
    count: supplyOrders.filter((order) => order.stage === stage).length,
  })).filter((row) => row.count > 0);
  const statuses = view === "supply" ? stageStatuses : retailStatuses;
  const urgentActions = previewMode
    ? [
        {
          id: "preview-po-action-1",
          label: "LATE / DELAYED",
          title: "DEMO-1062",
          meta: "4 days late | Sample Campus Bookstore",
          tone: "danger" as const,
          to: "/purchase-orders",
        },
        {
          id: "preview-po-action-2",
          label: "APPROVAL BLOCKED",
          title: "DEMO-1080",
          meta: "Pending approval | Demo Health Retailer",
          tone: "warning" as const,
          to: "/purchase-orders",
        },
        {
          id: "preview-po-action-3",
          label: "TRACKING GAP",
          title: "DEMO-1104",
          meta: "No tracking update | Sample Western Chain",
          tone: "warning" as const,
          to: "/purchase-orders",
        },
      ]
    : liveActions;
  const regions = buildMapRegions(points);
  const missingLocationCount = previewMode ? 0 : data.missingPoLocationCount;
  const maxAccountActivity = Math.max(
    ...accounts.map(
      (account) =>
        account.openInvoices + account.shippedInvoices + account.recentPoCount,
    ),
    1,
  );
  const maxChannelValue = Math.max(
    ...channels.map((channel) => channel.value),
    1,
  );
  const today = toDateInput(new Date());

  useEffect(() => {
    try {
      window.localStorage.setItem(MAP_VIEW_KEY, view);
    } catch {
      // Storage can be unavailable (private mode); the view just won't persist.
    }
  }, [view]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const copy = MAP_VIEW_COPY[view];

  return (
    <section
      className={`po-command-map panel${previewMode ? " po-command-map-preview" : ""}${fullscreen ? " po-command-map-fullscreen" : ""}`}
    >
      <div className="po-map-header">
        <div>
          <div className="po-map-title-row">
            <h2>{copy.title}</h2>
            {previewMode ? (
              <span className="preview-badge">Preview data</span>
            ) : null}
          </div>
          <span>{copy.description}</span>
        </div>
        <div className="po-map-controls">
          <div className="map-view-toggle" role="group" aria-label="Map view">
            <button
              type="button"
              aria-pressed={view === "supply"}
              onClick={() => setView("supply")}
            >
              Supply chain
            </button>
            <button
              type="button"
              aria-pressed={view === "retail"}
              onClick={() => setView("retail")}
            >
              Retail POs
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setPreviewMode((current) => !current)}
          >
            {previewMode ? "Return to live data" : "Preview map data"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            aria-pressed={fullscreen}
            onClick={() => setFullscreen((current) => !current)}
          >
            {fullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
        </div>
      </div>

      <div className="po-map-stage">
        <div
          className="po-map-canvas"
          aria-label={previewMode ? "Preview map" : "Live map"}
        >
          <div className="po-map-area">
            {view === "supply" ? (
              <SupplyChainMap
                orders={supplyOrders}
                today={today}
                selectedId={selectedOrderId}
                onSelect={setPickedOrderId}
              />
            ) : (
              <RetailPoMap regions={regions} previewMode={previewMode} />
            )}
            {view === "retail" && !regions.length ? (
              <div className="po-map-empty">
                <strong>No mapped PO states yet</strong>
                <span>
                  {missingLocationCount
                    ? `${missingLocationCount} open wholesale POs need ship-to state data.`
                    : "Use preview mode to see how the map fills in."}
                </span>
              </div>
            ) : null}
            {view === "retail" && missingLocationCount ? (
              <div className="po-map-missing">
                {missingLocationCount} missing location
              </div>
            ) : null}
            <MapLegend view={view} />
            <div className="po-map-overlays">
              <MapOverlayCard
                title="Accounts"
                actionTo="/retailers"
                position="top-left"
              >
                {accounts.slice(0, 4).map((account) => (
                  <AccountOverlayRow
                    key={account.retailerId}
                    account={account}
                    maxActivity={maxAccountActivity}
                    to={
                      previewMode
                        ? "/retailers"
                        : `/retailers/${account.retailerId}`
                    }
                  />
                ))}
              </MapOverlayCard>

              <MapOverlayCard
                title="Sales Channels"
                actionTo="/reports"
                position="bottom-left"
              >
                {channels.slice(0, 4).map((channel) => (
                  <ChannelOverlayRow
                    key={channel.channel}
                    channel={channel}
                    maxValue={maxChannelValue}
                  />
                ))}
              </MapOverlayCard>

              <MapOverlayCard
                title={view === "supply" ? "Factory orders" : "PO Status"}
                actionTo="/purchase-orders"
                position="top-right"
              >
                {statuses.length ? (
                  statuses.slice(0, 5).map((status) => (
                    <Link
                      key={status.status}
                      className="overlay-row"
                      to="/purchase-orders"
                    >
                      <span>{status.status}</span>
                      <StatusBadge label={String(status.count)} />
                    </Link>
                  ))
                ) : (
                  <div className="overlay-empty">Nothing in progress.</div>
                )}
              </MapOverlayCard>

              <MapOverlayCard
                title="Urgent Actions"
                actionTo="/alerts"
                position="bottom-right"
              >
                {urgentActions.length ? (
                  urgentActions.map((action) => (
                    <Link
                      key={action.id}
                      className={`overlay-action overlay-action-${action.tone}`}
                      to={action.to}
                    >
                      <span>{action.label}</span>
                      <strong>{action.title}</strong>
                      <em>{action.meta}</em>
                    </Link>
                  ))
                ) : (
                  <div className="overlay-empty">
                    No urgent PO actions right now.
                  </div>
                )}
              </MapOverlayCard>
            </div>
          </div>
          {view === "supply" ? (
            <OrderChainBar
              orders={supplyOrders}
              selectedId={selectedOrderId}
              averages={stepAverages}
              today={today}
              onSelect={setPickedOrderId}
              onOpen={(poId) => navigate(previewMode ? "/purchase-orders" : `/purchase-orders/${poId}`)}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AccountOverlayRow({
  account,
  maxActivity,
  to,
}: {
  account: AccountRow;
  maxActivity: number;
  to: string;
}) {
  const activity =
    account.openInvoices + account.shippedInvoices + account.recentPoCount;
  const width = Math.max((activity / maxActivity) * 100, 8);
  const status =
    account.openInvoices > 0
      ? "ATTENTION"
      : account.recentPoCount > 0
        ? "ACTIVE"
        : "WATCH";

  return (
    <Link className="overlay-visual-row" to={to}>
      <div className="overlay-visual-head">
        <span>{account.retailer}</span>
        <strong>{status}</strong>
      </div>
      <div className="overlay-bar-track" aria-hidden="true">
        <div
          className="overlay-bar-fill overlay-bar-fill-account"
          style={{ width: `${width}%` }}
        />
      </div>
      <em>
        {account.openInvoices} open · {account.recentPoCount} recent POs
      </em>
    </Link>
  );
}

function ChannelOverlayRow({
  channel,
  maxValue,
}: {
  channel: ChannelRow;
  maxValue: number;
}) {
  const width = Math.max(
    (channel.value / maxValue) * 100,
    channel.value > 0 ? 8 : 0,
  );

  return (
    <Link className="overlay-visual-row" to="/reports">
      <div className="overlay-visual-head">
        <span>{channel.channel}</span>
        <strong>{formatCurrency(channel.value)}</strong>
      </div>
      <div className="overlay-bar-track" aria-hidden="true">
        <div
          className="overlay-bar-fill overlay-bar-fill-channel"
          style={{ width: `${width}%` }}
        />
      </div>
      <em>
        {channel.count} wholesale PO{channel.count === 1 ? "" : "s"}
      </em>
    </Link>
  );
}

function MapLegend({ view }: { view: MapView }) {
  const items =
    view === "supply"
      ? [
          ["waiting", "Not paid yet"],
          ["production", "In production"],
          ["transit", "In transit"],
          ["received", "Received"],
          ["late", "Late"],
        ]
      : [
          ["danger", "Late"],
          ["warning", "Attention"],
          ["success", "In route"],
          ["info", "Open"],
        ];
  return (
    <div className="po-map-legend" aria-label="Map marker legend">
      {items.map(([tone, label]) => (
        <span key={tone}>
          <i className={`legend-dot map-tone-dot-${tone}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

function MapOverlayCard({
  title,
  actionTo,
  position,
  children,
}: {
  title: string;
  actionTo: string;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  children: ReactNode;
}) {
  return (
    <div className={`map-overlay-card map-overlay-${position}`}>
      <div className="map-overlay-head">
        <h3>{title}</h3>
        <Link to={actionTo}>View</Link>
      </div>
      <div className="map-overlay-list">{children}</div>
    </div>
  );
}

function DashboardActionLane({
  title,
  to,
  children,
}: {
  title: string;
  to: string;
  children: ReactNode;
}) {
  return (
    <section className="dashboard-action-lane panel">
      <div className="lane-header">
        <h2>{title}</h2>
        <Link to={to}>View all</Link>
      </div>
      <div className="lane-list">{children}</div>
    </section>
  );
}

function DashboardSummaryPanel({
  title,
  to,
  children,
}: {
  title: string;
  to: string;
  children: ReactNode;
}) {
  return (
    <section className="dashboard-summary-panel panel">
      <div className="lane-header">
        <h2>{title}</h2>
        <Link to={to}>View all</Link>
      </div>
      <div className="lane-list">{children}</div>
    </section>
  );
}

function PurchaserVelocityPanel({ data }: { data: DashboardSnapshot }) {
  return (
    <section className="purchaser-velocity-panel panel">
      <div className="purchaser-velocity-header">
        <div>
          <h2>Socks per purchaser</h2>
          <span>who's moving, who's stalling</span>
        </div>
        <div className="purchaser-velocity-average">
          avg {formatNumber(data.purchaserVelocityAverage)}/wk
        </div>
      </div>

      <div
        className="purchaser-velocity-table"
        role="table"
        aria-label="Socks per purchaser"
      >
        <div className="purchaser-velocity-columns" role="row">
          <span>Purchaser</span>
          <span>Pairs / wk</span>
          <span>Vs avg</span>
          <span>Best</span>
          <span />
        </div>
        {data.purchaserVelocityRows.length ? (
          data.purchaserVelocityRows.map((row) => (
            <Link
              key={row.retailerId}
              className="purchaser-velocity-row"
              to={`/retailers/${row.retailerId}`}
              role="row"
            >
              <div className="purchaser-cell" role="cell">
                <span className="purchaser-mark">{row.initials}</span>
                <div>
                  <strong>{row.purchaser}</strong>
                  <em>
                    {row.orderCount} wholesale PO
                    {row.orderCount === 1 ? "" : "s"}
                  </em>
                </div>
              </div>
              <strong className="purchaser-rate" role="cell">
                {formatNumber(row.pairsPerWeek)}/wk
              </strong>
              <span
                className={`purchaser-delta purchaser-delta-${row.deltaVsAverage > 0 ? "up" : row.deltaVsAverage < 0 ? "down" : "flat"}`}
                role="cell"
              >
                {row.deltaVsAverage > 0
                  ? "▲ +"
                  : row.deltaVsAverage < 0
                    ? "▼ -"
                    : "• "}
                {formatNumber(Math.abs(row.deltaVsAverage))}
              </span>
              <div className="purchaser-best" role="cell">
                <strong>
                  {row.bestPairsPerWeek !== null
                    ? formatNumber(row.bestPairsPerWeek)
                    : "—"}
                </strong>
                {row.bestPeriod ? <em>{row.bestPeriod}</em> : null}
              </div>
              <span className="purchaser-chevron" aria-hidden="true">
                ›
              </span>
            </Link>
          ))
        ) : (
          <div className="purchaser-velocity-empty">
            Purchaser velocity needs wholesale PO history.
          </div>
        )}
      </div>
    </section>
  );
}

export function DashboardPage() {
  const { data, loading, error } = useAsyncData(
    () => dashboardService.getSnapshot(),
    [],
  );

  if (loading) return <LoadingState />;
  if (error || !data)
    return <ErrorState message={error ?? "Unable to load dashboard"} />;

  const reorderNowRows = data.reorderNowItems.slice(0, 3);
  const inventoryRiskRows = data.inventoryAlerts.slice(0, 3);
  const delayedOrderRows = data.latePurchaseOrders.slice(0, 3);
  const manufacturingIncomingRows = data.manufacturingIncoming.slice(0, 3);

  return (
    <div className="dashboard-command dashboard-v2">
      <CommandMetricStrip data={data} />

      <PoCommandMap data={data} />
      <PurchaserVelocityPanel data={data} />

      <div className="dashboard-action-grid">
        <DashboardActionLane title="Reorder Now" to="/products/inventory">
          {reorderNowRows.length ? (
            reorderNowRows.map((item) => (
              <div
                key={item.sku}
                className={`lane-card${item.isOversold ? " lane-card-danger" : ""}`}
              >
                <div className="lane-card-head">
                  <strong>{item.productName || item.sku}</strong>
                  <StatusBadge label={item.statusLabel} />
                </div>
                <span className="helper-text">
                  {item.sku}
                  {item.variantTitle ? ` · ${item.variantTitle}` : ""}
                </span>
                <div className="lane-card-meta">
                  <span>On hand: {formatNumber(item.currentQuantity)}</span>
                  {item.isOversold ? (
                    <span>{item.statusLabel}</span>
                  ) : (
                    <span>Needed: {formatNumber(item.shortageQuantity)}</span>
                  )}
                </div>
                <div className="lane-card-actions">
                  {/* TODO: deep-link vendor/product once the PO builder supports prefill query params */}
                  <Link
                    className="btn btn-secondary btn-small po-edit-btn"
                    to="/purchase-orders/new"
                  >
                    Create Manufacturing PO
                  </Link>
                  <Link className="btn btn-ghost btn-small" to="/products/inventory">
                    View Inventory
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="lane-empty">No reorder-now SKUs.</div>
          )}
        </DashboardActionLane>

        <DashboardSummaryPanel title="Inventory Risk" to="/products/inventory">
          {inventoryRiskRows.length ? (
            inventoryRiskRows.map((item) => (
              <div
                key={item.sku}
                className={`lane-card lane-card-${item.status}`}
              >
                <div className="lane-card-head">
                  <strong>{item.productName || item.sku}</strong>
                  <StatusBadge label={item.riskStatus} />
                </div>
                <span className="helper-text">{item.sku}</span>
                <div className="lane-card-meta">
                  <span>On hand {formatNumber(item.currentQuantity)}</span>
                  <span>Committed {formatNumber(item.committedQuantity)}</span>
                  <span>Incoming {formatNumber(item.incomingQuantity)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="lane-empty">Inventory risk is clear.</div>
          )}
        </DashboardSummaryPanel>
      </div>

      <div className="dashboard-summary-row">
        <DashboardActionLane title="Delayed Orders" to="/purchase-orders">
          {delayedOrderRows.length ? (
            delayedOrderRows.map((po) => (
              <div key={po.poId} className="lane-card lane-card-danger">
                <div className="lane-card-head">
                  <strong>{po.partner}</strong>
                  <StatusBadge label={String(po.status)} />
                </div>
                <span className="helper-text">{po.poNumber}</span>
                <div className="lane-card-meta">
                  <span>{po.reason}</span>
                  <span>
                    {po.daysLate !== null && po.daysLate > 0
                      ? `${po.daysLate} day${po.daysLate === 1 ? "" : "s"} late`
                      : po.daysLate === 0
                        ? "Due today"
                        : `ETA ${formatDate(po.etaDate)}`}
                  </span>
                </div>
                <div className="lane-card-actions">
                  <Link
                    className="btn btn-secondary btn-small"
                    to={`/purchase-orders/${po.poId}`}
                  >
                    View
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="lane-empty">No delayed orders.</div>
          )}
        </DashboardActionLane>

        <DashboardSummaryPanel title="Manufacturing Incoming" to="/production">
          {manufacturingIncomingRows.length ? (
            manufacturingIncomingRows.map((row) => (
              <div key={row.id} className="lane-card">
                <div className="lane-card-head">
                  <strong>{row.productName}</strong>
                  <StatusBadge label={row.manufacturingStatus} />
                </div>
                <span className="helper-text">
                  {formatNumber(row.quantityOrdered)} units · {row.manufacturer}
                </span>
                <div className="lane-card-meta">
                  <span>Ordered {formatDate(row.orderedDate)}</span>
                  <StatusBadge label={row.paymentStatus} />
                  {row.shipDate ? (
                    <span>Ship {formatDate(row.shipDate)}</span>
                  ) : null}
                  {row.arrivalDate ? (
                    <span>Arrive {formatDate(row.arrivalDate)}</span>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="lane-empty">No active inbound manufacturing.</div>
          )}
        </DashboardSummaryPanel>
      </div>
    </div>
  );
}
