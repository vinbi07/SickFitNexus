import type {
  Buyer,
  Invoice,
  InventoryEvent,
  Product,
  ProductionPlan,
  PurchaseOrder,
  Retailer,
  RetailerComplianceDocument,
  RetailerComplianceRequirement,
  Vendor,
} from "@/types/domain";
import { addDays, daysBetween, toDateInput } from "@/utils/date";
import { calculateForecastMetric } from "@/utils/forecasting";
import { computeDateStatus } from "@/lib/calendar/calendarStatus";
import type { CalendarEvent, CalendarEventStatus, ManualCalendarEventRow } from "@/lib/calendar/calendarTypes";

const PO_TERMINAL_STATUSES = new Set(["Received", "Fulfilled", "Closed", "Cancelled"]);
const PO_BLOCKED_STATUSES = new Set(["On Hold", "Issue Flagged", "Delayed"]);

function poDateStatus(po: PurchaseOrder, today: string, dateField: string | null): CalendarEventStatus {
  if (PO_TERMINAL_STATUSES.has(po.status)) return "completed";
  if (PO_BLOCKED_STATUSES.has(po.status)) return "blocked";
  return computeDateStatus({ date: dateField, today, isTerminal: false });
}

export function adaptPurchaseOrdersToEvents(purchaseOrders: PurchaseOrder[], today: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const po of purchaseOrders) {
    const partnerName = po.vendors?.name ?? po.retailers?.name ?? null;

    if (po.expected_delivery_date) {
      events.push({
        id: `purchase_order:${po.id}:expected_delivery_date`,
        category: "purchase_order",
        title: `PO ${po.po_number} expected delivery`,
        date: po.expected_delivery_date,
        status: poDateStatus(po, today, po.expected_delivery_date),
        priority: null,
        isAutomaticallyGenerated: true,
        isEditableDate: true,
        sourceType: "purchase_order",
        sourceId: po.id,
        sourceHref: `/purchase-orders/${po.id}`,
        sourceDateField: "expected_delivery_date",
        retailerId: po.retailer_id,
        retailerName: po.retailers?.name ?? null,
        manufacturerId: po.vendor_id,
        manufacturerName: po.vendors?.name ?? null,
        productId: null,
        productName: null,
        ownerLabel: po.approved_by ?? po.buyer_name_snapshot ?? null,
        amount: po.total_cost ?? null,
        description: partnerName ? `Expected delivery from ${partnerName}.` : null,
        metadata: { poNumber: po.po_number, status: po.status, poType: po.po_type },
      });
    }

    const shipDate = po.ship_complete_date ?? po.start_ship_date;
    if (shipDate) {
      events.push({
        id: `purchase_order:${po.id}:ship_window`,
        category: "purchase_order",
        title: `PO ${po.po_number} ship window closes`,
        date: shipDate,
        status: poDateStatus(po, today, shipDate),
        priority: null,
        isAutomaticallyGenerated: true,
        isEditableDate: false,
        sourceType: "purchase_order",
        sourceId: po.id,
        sourceHref: `/purchase-orders/${po.id}`,
        sourceDateField: null,
        retailerId: po.retailer_id,
        retailerName: po.retailers?.name ?? null,
        manufacturerId: po.vendor_id,
        manufacturerName: po.vendors?.name ?? null,
        productId: null,
        productName: null,
        ownerLabel: po.approved_by ?? null,
        amount: po.total_cost ?? null,
        description: "Ship window for this purchase order.",
        metadata: { poNumber: po.po_number, status: po.status },
      });
    }

    const approvalAnchor = po.submitted_at ?? po.order_date;
    if (po.approval_status === "Pending Approval" && approvalAnchor) {
      events.push({
        id: `purchase_order:${po.id}:approval`,
        category: "purchase_order",
        title: `PO ${po.po_number} awaiting approval`,
        date: approvalAnchor.slice(0, 10),
        status: "waiting",
        priority: "high",
        isAutomaticallyGenerated: true,
        isEditableDate: false,
        sourceType: "purchase_order",
        sourceId: po.id,
        sourceHref: `/purchase-orders/${po.id}`,
        sourceDateField: null,
        retailerId: po.retailer_id,
        retailerName: po.retailers?.name ?? null,
        manufacturerId: po.vendor_id,
        manufacturerName: po.vendors?.name ?? null,
        productId: null,
        productName: null,
        ownerLabel: po.approved_by ?? null,
        amount: po.total_cost ?? null,
        description: "This purchase order needs approval before proceeding.",
        metadata: { poNumber: po.po_number },
      });
    }
  }

  return events;
}

const INVOICE_TERMINAL_STATUSES = new Set(["Paid", "Void"]);

function parseNetTermsDueDate(invoice: Invoice): string | null {
  const terms = invoice.payment_terms_snapshot ?? "";
  const match = terms.match(/net\s*(\d+)/i);
  if (!match) return null;
  const anchor = invoice.order_date ?? invoice.ship_complete_date ?? invoice.created_at;
  if (!anchor) return null;
  const days = Number(match[1]);
  return toDateInput(addDays(new Date(`${anchor.slice(0, 10)}T00:00:00`), days));
}

export function adaptInvoicesToEvents(invoices: Invoice[], today: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const invoice of invoices) {
    const isTerminal = INVOICE_TERMINAL_STATUSES.has(invoice.status);
    const partnerName = invoice.retailers?.name ?? invoice.vendors?.name ?? null;
    const dueDate = parseNetTermsDueDate(invoice);

    if (dueDate) {
      const status: CalendarEventStatus = isTerminal
        ? "completed"
        : invoice.status === "Draft"
          ? "waiting"
          : computeDateStatus({ date: dueDate, today, isTerminal: false });

      events.push({
        id: `invoice:${invoice.id}:due_date`,
        category: "invoice",
        title: `Invoice ${invoice.invoice_number} payment due`,
        date: dueDate,
        status,
        priority: status === "overdue" ? "high" : null,
        isAutomaticallyGenerated: true,
        isEditableDate: false,
        sourceType: "invoice",
        sourceId: invoice.id,
        sourceHref: `/invoices/${invoice.id}`,
        sourceDateField: null,
        retailerId: invoice.retailer_id,
        retailerName: invoice.retailers?.name ?? null,
        manufacturerId: invoice.vendor_id,
        manufacturerName: invoice.vendors?.name ?? null,
        productId: null,
        productName: null,
        ownerLabel: invoice.approver_name_snapshot ?? null,
        amount: invoice.total_cost ?? null,
        description: partnerName
          ? `Payment due from ${partnerName} (${invoice.payment_terms_snapshot}). Due date estimated from payment terms.`
          : "Due date estimated from payment terms.",
        metadata: { invoiceNumber: invoice.invoice_number, status: invoice.status, dueDateIsEstimated: true },
      });
    }

    if (invoice.expected_delivery_date) {
      events.push({
        id: `invoice:${invoice.id}:expected_delivery_date`,
        category: "invoice",
        title: `Invoice ${invoice.invoice_number} delivery expected`,
        date: invoice.expected_delivery_date,
        status: isTerminal
          ? "completed"
          : computeDateStatus({ date: invoice.expected_delivery_date, today, isTerminal: false }),
        priority: null,
        isAutomaticallyGenerated: true,
        isEditableDate: false,
        sourceType: "invoice",
        sourceId: invoice.id,
        sourceHref: `/invoices/${invoice.id}`,
        sourceDateField: null,
        retailerId: invoice.retailer_id,
        retailerName: invoice.retailers?.name ?? null,
        manufacturerId: invoice.vendor_id,
        manufacturerName: invoice.vendors?.name ?? null,
        productId: null,
        productName: null,
        ownerLabel: invoice.approver_name_snapshot ?? null,
        amount: invoice.total_cost ?? null,
        description: null,
        metadata: { invoiceNumber: invoice.invoice_number, status: invoice.status },
      });
    }
  }

  return events;
}

const PLAN_TERMINAL_STATUSES = new Set(["Converted", "Archived", "Cancelled"]);

function planDateStatus(plan: ProductionPlan, today: string, date: string | null): CalendarEventStatus {
  if (PLAN_TERMINAL_STATUSES.has(plan.status)) return "completed";
  if (plan.status === "Needs Review") return "at_risk";
  if (plan.status === "Draft") return "waiting";
  return computeDateStatus({ date, today, isTerminal: false });
}

export function adaptProductionPlansToEvents(plans: ProductionPlan[], today: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const plan of plans) {
    const description = `Production plan goal: ${plan.goal.replace(/_/g, " ")}.`;

    if (plan.planned_order_date) {
      events.push({
        id: `production:${plan.id}:planned_order_date`,
        category: "production",
        title: `${plan.name} planned order date`,
        date: plan.planned_order_date,
        status: planDateStatus(plan, today, plan.planned_order_date),
        priority: null,
        isAutomaticallyGenerated: true,
        isEditableDate: true,
        sourceType: "production_plan",
        sourceId: plan.id,
        sourceHref: `/production/planner/${plan.id}`,
        sourceDateField: "planned_order_date",
        retailerId: null,
        retailerName: null,
        manufacturerId: plan.vendor_id,
        manufacturerName: plan.vendors?.name ?? null,
        productId: null,
        productName: null,
        ownerLabel: plan.approved_by ?? null,
        amount: null,
        description,
        metadata: { planName: plan.name, status: plan.status },
      });
    }

    if (plan.target_arrival_date) {
      events.push({
        id: `production:${plan.id}:target_arrival_date`,
        category: "production",
        title: `${plan.name} target arrival`,
        date: plan.target_arrival_date,
        status: planDateStatus(plan, today, plan.target_arrival_date),
        priority: null,
        isAutomaticallyGenerated: true,
        isEditableDate: true,
        sourceType: "production_plan",
        sourceId: plan.id,
        sourceHref: `/production/planner/${plan.id}`,
        sourceDateField: "target_arrival_date",
        retailerId: null,
        retailerName: null,
        manufacturerId: plan.vendor_id,
        manufacturerName: plan.vendors?.name ?? null,
        productId: null,
        productName: null,
        ownerLabel: plan.approved_by ?? null,
        amount: null,
        description,
        metadata: { planName: plan.name, status: plan.status },
      });
    }
  }

  return events;
}

export function adaptInventoryToEvents(
  products: Product[],
  inventoryEventsByProductId: Map<string, InventoryEvent[]>,
  vendorsById: Map<string, Vendor>,
  today: string,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const product of products) {
    if (product.ignored) continue;
    const productEvents = inventoryEventsByProductId.get(product.id) ?? [];
    const vendorLeadTime = product.vendor_id ? vendorsById.get(product.vendor_id)?.lead_time_days ?? 14 : 14;
    const forecast = calculateForecastMetric(product, productEvents, vendorLeadTime);

    if (!forecast.projectedDepletionDate || forecast.projectedDaysRemaining === null) continue;
    if (forecast.projectedDaysRemaining > 30) continue;

    const status = computeDateStatus({
      date: forecast.projectedDepletionDate,
      today,
      isTerminal: false,
      atRiskThresholdDays: 14,
      dueSoonThresholdDays: 30,
    });

    events.push({
      id: `inventory:${product.id}:projected_depletion`,
      category: "inventory",
      title: `${product.name} projected stockout`,
      date: forecast.projectedDepletionDate,
      status,
      priority: status === "overdue" || status === "at_risk" ? "high" : "medium",
      isAutomaticallyGenerated: true,
      isEditableDate: false,
      sourceType: "product",
      sourceId: product.id,
      sourceHref: `/products/${product.id}`,
      sourceDateField: null,
      retailerId: null,
      retailerName: null,
      manufacturerId: product.vendor_id,
      manufacturerName: product.vendor_id ? vendorsById.get(product.vendor_id)?.name ?? null : null,
      productId: product.id,
      productName: product.name,
      ownerLabel: null,
      amount: null,
      description: `${Math.max(Math.round(forecast.projectedDaysRemaining), 0)} days of inventory remaining at current usage.`,
      metadata: { sku: product.sku, currentInventory: product.current_inventory },
    });
  }

  return events;
}

export function adaptRetailersToEvents(retailers: Retailer[], today: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const retailer of retailers) {
    if (!retailer.next_reorder_start) continue;

    let status = computeDateStatus({
      date: retailer.next_reorder_start,
      today,
      isTerminal: false,
      atRiskThresholdDays: 0,
      dueSoonThresholdDays: 14,
    });

    if (retailer.next_reorder_end) {
      const startPassed = daysBetween(today, retailer.next_reorder_start) < 0;
      const endPassed = daysBetween(today, retailer.next_reorder_end) < 0;
      if (endPassed) status = "completed";
      else if (startPassed) status = "waiting";
    }

    events.push({
      id: `retailer:${retailer.id}:reorder_window`,
      category: "retailer",
      title: `${retailer.name} reorder window opens`,
      date: retailer.next_reorder_start,
      status,
      priority: null,
      isAutomaticallyGenerated: true,
      isEditableDate: false,
      sourceType: "retailer",
      sourceId: retailer.id,
      sourceHref: `/retailers/${retailer.id}`,
      sourceDateField: null,
      retailerId: retailer.id,
      retailerName: retailer.name,
      manufacturerId: null,
      manufacturerName: null,
      productId: null,
      productName: null,
      ownerLabel: retailer.primary_contact_name ?? null,
      amount: null,
      description: retailer.next_reorder_end ? `Reorder window runs through ${retailer.next_reorder_end}.` : null,
      metadata: { retailerName: retailer.name },
    });
  }

  return events;
}

export function adaptComplianceToEvents(
  requirements: RetailerComplianceRequirement[],
  documents: RetailerComplianceDocument[],
  today: string,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const requirement of requirements) {
    if (!requirement.expires_at) continue;
    const status: CalendarEventStatus =
      requirement.status === "Compliant"
        ? computeDateStatus({
            date: requirement.expires_at,
            today,
            isTerminal: false,
            atRiskThresholdDays: 14,
            dueSoonThresholdDays: 30,
          })
        : "waiting";

    events.push({
      id: `compliance:requirement:${requirement.id}`,
      category: "compliance",
      title: `${requirement.requirement_types?.name ?? "Compliance requirement"} expiring`,
      date: requirement.expires_at,
      status,
      priority: status === "overdue" ? "high" : null,
      isAutomaticallyGenerated: true,
      isEditableDate: false,
      sourceType: "compliance_requirement",
      sourceId: requirement.id,
      sourceHref: requirement.retailer_id ? `/retailers/${requirement.retailer_id}` : "/compliance",
      sourceDateField: null,
      retailerId: requirement.retailer_id,
      retailerName: requirement.retailers?.name ?? null,
      manufacturerId: null,
      manufacturerName: null,
      productId: null,
      productName: null,
      ownerLabel: null,
      amount: null,
      description: requirement.notes,
      metadata: { requirementStatus: requirement.status },
    });
  }

  for (const document of documents) {
    if (!document.expires_at) continue;
    events.push({
      id: `compliance:document:${document.id}`,
      category: "compliance",
      title: `${document.title} expiring`,
      date: document.expires_at,
      status: computeDateStatus({
        date: document.expires_at,
        today,
        isTerminal: false,
        atRiskThresholdDays: 14,
        dueSoonThresholdDays: 30,
      }),
      priority: null,
      isAutomaticallyGenerated: true,
      isEditableDate: false,
      sourceType: "compliance_document",
      sourceId: document.id,
      sourceHref: "/compliance",
      sourceDateField: null,
      retailerId: null,
      retailerName: null,
      manufacturerId: null,
      manufacturerName: null,
      productId: null,
      productName: null,
      ownerLabel: null,
      amount: null,
      description: null,
      metadata: {},
    });
  }

  return events;
}

export function adaptLookbookAccessToEvents(buyers: Buyer[], today: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const buyer of buyers) {
    if (!buyer.token_expires_at) continue;
    const expiresDate = buyer.token_expires_at.slice(0, 10);

    events.push({
      id: `lookbook:${buyer.id}:token_expires_at`,
      category: "lookbook",
      title: `${buyer.buyer_name} lookbook link expiring`,
      date: expiresDate,
      status: computeDateStatus({
        date: expiresDate,
        today,
        isTerminal: false,
        atRiskThresholdDays: 7,
        dueSoonThresholdDays: 14,
      }),
      priority: null,
      isAutomaticallyGenerated: true,
      isEditableDate: false,
      sourceType: "buyer",
      sourceId: buyer.id,
      sourceHref: `/retailers/${buyer.retailer_id}`,
      sourceDateField: null,
      retailerId: buyer.retailer_id,
      retailerName: buyer.retailers?.name ?? null,
      manufacturerId: null,
      manufacturerName: null,
      productId: null,
      productName: null,
      ownerLabel: buyer.assigned_sales_rep,
      amount: null,
      description: `Ordering link for ${buyer.company_name}.`,
      metadata: { buyerEmail: buyer.buyer_email },
    });
  }

  return events;
}

export function adaptManualEventsToEvents(
  rows: ManualCalendarEventRow[],
  retailersById: Map<string, Retailer>,
  vendorsById: Map<string, Vendor>,
  productsById: Map<string, Product>,
): CalendarEvent[] {
  return rows.map((row) => ({
    id: `manual:${row.id}`,
    category: "manual",
    title: row.title,
    date: row.event_date,
    status: (row.status as CalendarEventStatus) || "scheduled",
    priority: (row.priority as CalendarEvent["priority"]) ?? null,
    isAutomaticallyGenerated: false,
    isEditableDate: true,
    sourceType: "manual",
    sourceId: row.id,
    sourceHref: null,
    sourceDateField: "event_date",
    retailerId: row.retailer_id,
    retailerName: row.retailer_id ? retailersById.get(row.retailer_id)?.name ?? null : null,
    manufacturerId: row.vendor_id,
    manufacturerName: row.vendor_id ? vendorsById.get(row.vendor_id)?.name ?? null : null,
    productId: row.product_id,
    productName: row.product_id ? productsById.get(row.product_id)?.name ?? null : null,
    ownerLabel: row.owner_label,
    amount: null,
    description: row.description,
    metadata: {
      relatedEntityType: row.related_entity_type,
      relatedEntityId: row.related_entity_id,
      createdByLabel: row.created_by_label,
    },
  }));
}
