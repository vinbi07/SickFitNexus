export interface Vendor {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  lead_time_days: number;
  average_delay_days: number;
  reliability_score: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Retailer {
  id: string;
  name: string;
  status: "Prospect" | "Pilot" | "Active" | "Paused";
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  secondary_contacts: string | null;
  account_number: string | null;
  supplier_id: string | null;
  activation_id: string | null;
  shipping_requirements: string | null;
  sop_notes: string | null;
  parent_retailer_id: string | null;
  retailer_group: string | null;
  logo_url: string | null;
  brand_accent_color: string | null;
  lookbook_intro: string | null;
  default_payment_terms: string | null;
  order_mode_policy: "enabled" | "catalog_only" | "edi_only";
  edi_required: boolean;
  ordering_cadence_days: number | null;
  next_reorder_start: string | null;
  next_reorder_end: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Buyer {
  id: string;
  retailer_id: string;
  lookbook_template_id: string | null;
  lookbook_status: "draft" | "ready";
  company_name: string;
  buyer_name: string;
  buyer_email: string;
  phone: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  payment_terms: string | null;
  order_mode_enabled: boolean;
  compliance_requirements: string | null;
  assigned_sales_rep: string | null;
  access_token: string;
  link_validity_days: number | null;
  token_expires_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
  retailers?: Retailer | null;
  lookbook_templates?: LookbookTemplate | null;
}

export interface LookbookTemplate {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LookbookTemplateItem {
  id: string;
  template_id: string;
  product_id: string;
  sort_order: number;
  featured: boolean;
  created_at: string;
  products?: Product | null;
}

export interface Location {
  id: string;
  name: string;
  type: string | null;
  address: string | null;
  retailer_id: string | null;
  created_at: string;
  updated_at: string;
  retailers?: Retailer | null;
}

export interface Product {
  id: string;
  parent_product_id: string | null;
  sku: string;
  upc: string | null;
  name: string;
  variant_title: string | null;
  variant_sort_order: number;
  category: string | null;
  description: string | null;
  vendor_id: string | null;
  unit_cost: number;
  unit_price: number;
  pack_size: string | null;
  pack_quantity?: number | null;
  pack_unit?: string | null;
  case_pack_quantity: number;
  wholesale_price: number;
  msrp: number;
  weight: string | null;
  dimensions: string | null;
  current_inventory: number;
  inventory_available: number;
  inventory_allocated: number;
  safety_stock: number;
  image_url: string | null;
  compliance_docs_required: string[];
  compliance_docs_status: string | null;
  no_bundles: boolean;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_handle: string | null;
  shopify_admin_url: string | null;
  shopify_storefront_url: string | null;
  is_shopify_synced: boolean;
  last_shopify_sync_at: string | null;
  created_at: string;
  updated_at: string;
  vendors?: Vendor | null;
  parent_products?: Product | null;
  variants?: Product[];
  product_barcode_links?: ProductBarcodeLink[];
}

export interface ProductBarcode {
  id: string;
  sku: string;
  handle: string | null;
  product_name: string;
  collection: string | null;
  pack_quantity: number | null;
  pack_unit: string | null;
  size: string | null;
  barcode_upc: string | null;
  created_at: string;
  updated_at: string;
  product_barcode_links?: ProductBarcodeLink[];
}

export interface ProductBarcodeLink {
  id: string;
  barcode_id: string;
  product_id: string;
  created_at: string;
  products?: Product | null;
  product_barcodes?: ProductBarcode | null;
}

export interface InventoryItem {
  id: string;
  product_id: string;
  location_id: string;
  quantity_on_hand: number;
  reorder_point: number;
  target_stock: number;
  notes: string | null;
  inventory_category: "Core" | "Packaging" | "Ancillary";
  created_at: string;
  updated_at: string;
  products?: Product | null;
  locations?: Location | null;
}

export type PurchaseOrderStatus =
  | "Draft"
  | "Pending"
  | "Pending Approval"
  | "On Hold"
  | "Ordered"
  | "Countered"
  | "In Transit"
  | "Partially Received"
  | "Received"
  | "Fulfilled"
  | "Cancelled"
  | "Delayed"
  | "Issue Flagged"
  | "Closed";

export type PurchaseOrderType =
  | "Manufacturer PO"
  | "Retailer PO"
  | "Work Order"
  | "Customer Reorder";

export interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_id: string | null;
  retailer_id: string | null;
  buyer_id: string | null;
  location_id: string | null;
  status: PurchaseOrderStatus;
  po_type: PurchaseOrderType;
  approval_status: "Not Requested" | "Pending Approval" | "Approved" | "Rejected" | "Cancelled";
  allocation_status: "Not Allocated" | "Allocated" | "Released" | "Queued for Fulfillment" | "Fulfilled";
  order_date: string | null;
  ship_date: string | null;
  submitted_at: string | null;
  eta_date: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  invoice_status: "Open" | "Shipped" | "In Route" | "Inventory in Route" | null;
  invoice_paid_at: string | null;
  tracking_number: string | null;
  shipment_status: string | null;
  tracking_status: string | null;
  generated_form_url: string | null;
  source_channel: string | null;
  currency_code: string | null;
  bill_to_company_name: string | null;
  bill_to_contact_name: string | null;
  bill_to_street: string | null;
  bill_to_city: string | null;
  bill_to_state: string | null;
  bill_to_zip: string | null;
  bill_to_phone: string | null;
  bill_to_email: string | null;
  ship_to_company_name: string | null;
  ship_to_attention: string | null;
  ship_to_street: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
  ship_to_phone: string | null;
  payment_terms_snapshot: string | null;
  buyer_name_snapshot: string | null;
  approver_name_snapshot: string | null;
  compliance_snapshot: Record<string, unknown>;
  buyer_notes: string | null;
  internal_notes: string | null;
  hold_reason: string | null;
  counter_status: "None" | "Countered" | "Accepted" | "Declined";
  start_ship_date: string | null;
  ship_complete_date: string | null;
  subtotal: number;
  total_units: number;
  total_retail: number;
  requested_action: "draft" | "quote" | "submit";
  approved_at: string | null;
  approved_by: string | null;
  queued_for_fulfillment_at: string | null;
  cancelled_at: string | null;
  total_cost: number;
  source_file_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vendors?: Vendor | null;
  retailers?: Retailer | null;
  buyers?: Buyer | null;
  locations?: Location | null;
}

export interface PoLineItem {
  id: string;
  purchase_order_id: string;
  product_id: string | null;
  sku: string;
  upc: string | null;
  product_name: string;
  variant_label: string | null;
  description: string | null;
  unit: string;
  case_pack_quantity: number;
  case_quantity: number;
  unit_quantity: number;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  unit_retail: number;
  line_total: number;
  extended_cost: number;
  extended_retail: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  products?: Product | null;
  // Manufacturer PO fields (nullable — only populated for Manufacturer POs)
  design_id?: string | null;
  spec_snapshot?: Record<string, unknown> | null;
  sock_card_id?: string | null;
  pack_pairs?: number | null;
  sock_size?: string | null;
  construction?: string | null;
  cards_used?: number | null;
  box_no?: string | null;
  pantone?: string | null;
  barcode_required?: boolean | null;
  art_status?: string | null;
  art_note?: string | null;
  mockup_file_ref?: string | null;
  artwork_file_ref?: string | null;
  rib_lr?: boolean | null;
  toe?: boolean | null;
  pattern?: boolean | null;
  signature?: boolean | null;
  foot_text?: string | null;
}

export type InvoiceStatus = "Draft" | "Sent" | "Paid" | "Void";

export interface Invoice {
  id: string;
  invoice_number: string;
  source_po_id: string | null;
  vendor_id: string | null;
  retailer_id: string | null;
  buyer_id: string | null;
  location_id: string | null;
  status: InvoiceStatus;
  order_date: string | null;
  ship_date: string | null;
  start_ship_date: string | null;
  ship_complete_date: string | null;
  eta_date: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  submitted_at: string | null;
  bill_to_company_name: string | null;
  bill_to_contact_name: string | null;
  bill_to_street: string | null;
  bill_to_city: string | null;
  bill_to_state: string | null;
  bill_to_zip: string | null;
  bill_to_phone: string | null;
  bill_to_email: string | null;
  ship_to_company_name: string | null;
  ship_to_attention: string | null;
  ship_to_street: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
  ship_to_phone: string | null;
  payment_terms_snapshot: string | null;
  buyer_name_snapshot: string | null;
  approver_name_snapshot: string | null;
  subtotal: number;
  total_cost: number;
  total_units: number;
  total_retail: number;
  currency_code: string;
  notes: string | null;
  buyer_notes: string | null;
  internal_notes: string | null;
  source_channel: string | null;
  created_at: string;
  updated_at: string;
  vendors?: Vendor | null;
  retailers?: Retailer | null;
  buyers?: Buyer | null;
  locations?: Location | null;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  sku: string;
  upc: string | null;
  product_name: string;
  variant_label: string | null;
  description: string | null;
  unit: string;
  case_pack_quantity: number;
  case_quantity: number;
  unit_quantity: number;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  unit_retail: number;
  line_total: number;
  extended_cost: number;
  extended_retail: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  products?: Product | null;
}

export interface OrderDesign {
  id: string;
  name: string;
  type: "standard" | "custom";
  partner: string | null;
  colorway: string | null;
  hex: string | null;
  pantone: string | null;
  construction: string | null;
  default_sock_card_id: string | null;
  barcode: string | null;
  barcode_required: boolean;
  retail_price: number;
  exw_cost: number;
  foot_text: string | null;
  rib_lr: boolean;
  toe: boolean;
  pattern: boolean;
  signature: boolean;
  art_file_ref: string | null;
  mockup_file_ref: string | null;
  art_status: "ON FILE" | "NEEDED" | "NA";
  in_shopify: boolean;
  shopify_product_id: string | null;
  product_id: string | null;
  barcode_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SockCard {
  id: string;
  name: string;
  pack_pairs: number;
  size: string | null;
  style: string | null;
  on_hand: number;
  reorder_point: number;
  supplier: string | null;
  unit_cost: number | null;
  created_at: string;
  updated_at: string;
}

export interface SockCardTxn {
  id: string;
  sock_card_id: string;
  purchase_order_id: string;
  po_line_item_id: string | null;
  quantity_change: number;
  cards_used: number;
  txn_type: string;
  notes: string | null;
  created_at: string;
}

export interface PurchaseOrderMessage {
  id: string;
  purchase_order_id: string;
  sender_name: string;
  sender_role: string | null;
  channel: "Email" | "Text" | "Call" | "Internal Note";
  body: string;
  created_at: string;
}

export interface PurchaseOrderDocument {
  id: string;
  purchase_order_id: string;
  document_type: "Retailer Intake" | "Generated Form" | "Invoice" | "Tracking" | "Other";
  title: string;
  file_url: string | null;
  created_at: string;
}

export interface PurchaseOrderNotification {
  id: string;
  purchase_order_id: string;
  recipient_type: "buyer" | "internal";
  recipient_name: string | null;
  recipient_email: string | null;
  channel: string;
  notification_type: string;
  status: "queued" | "processing" | "sent" | "failed";
  subject: string;
  body: string;
  payload: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryReservation {
  id: string;
  purchase_order_id: string;
  po_line_item_id: string | null;
  product_id: string;
  reserved_units: number;
  status: "Reserved" | "Released" | "Committed";
  action_type: "submit" | "reject" | "counter" | "approve" | "fulfill" | "manual";
  actor_user_id: string | null;
  actor_label: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderStatusHistory {
  id: string;
  purchase_order_id: string;
  from_status: string | null;
  to_status: string;
  actor_user_id: string | null;
  actor_label: string | null;
  notes: string | null;
  created_at: string;
}

export interface PurchaseOrderCounterEvent {
  id: string;
  purchase_order_id: string;
  actor_user_id: string | null;
  actor_label: string | null;
  event_type: "countered" | "accepted" | "declined" | "buyer_revised";
  notes: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ComplianceHold {
  id: string;
  purchase_order_id: string;
  buyer_id: string | null;
  retailer_id: string | null;
  status: "Open" | "Resolved" | "Dismissed";
  summary: string;
  missing_docs: string[];
  notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  purchase_orders?: PurchaseOrder | null;
  buyers?: Buyer | null;
  retailers?: Retailer | null;
}

export interface GeneratedPurchaseOrderDocument {
  id: string;
  purchase_order_id: string;
  document_format: "html";
  title: string;
  body_html: string;
  created_by_user_id: string | null;
  created_by_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboundIntakeRequest {
  id: string;
  request_type: "order" | "retailer" | "other";
  source_channel: "Forwarded Email" | "Drag and Drop" | "Manual";
  status: "Pending" | "In Review" | "Converted" | "Closed";
  retailer_name: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  subject: string;
  notes: string | null;
  requested_action: string | null;
  converted_purchase_order_id: string | null;
  converted_retailer_id: string | null;
  created_by_user_id: string | null;
  created_by_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboundIntakeAttachment {
  id: string;
  intake_request_id: string;
  title: string;
  file_url: string | null;
  created_at: string;
}

export interface DashboardOperator {
  id: string;
  email: string;
  display_name: string;
}

export interface ComplianceSnapshot {
  retailerId: string;
  buyerId: string;
  summary: string;
  compliantCount: number;
  requiredCount: number;
  missingDocs: string[];
  productWarnings: Array<{
    productId: string;
    sku: string;
    missingDocs: string[];
  }>;
}

export interface LookbookOrderInputLine {
  product_id: string;
  sku: string;
  requested_case_quantity: number;
}

export interface LookbookOrderTotals {
  skuCount: number;
  totalUnits: number;
  subtotal: number;
  totalRetail: number;
}

export interface LookbookView {
  id: string;
  buyer_id: string | null;
  retailer_id: string | null;
  access_token: string;
  event_type: "opened" | "draft_saved" | "quote_requested" | "submitted";
  session_label: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RetailerBuyerAnalytics {
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  orderModeEnabled: boolean;
  linkValidityDays: number | null;
  lastViewedAt: string | null;
  totalViews: number;
  totalDraftSaves: number;
  totalQuoteRequests: number;
  totalSubmissions: number;
  activeOrderStatus: string | null;
  activeOrderUpdatedAt: string | null;
}

export interface RetailerLookbookActivity {
  buyerId: string | null;
  buyerName: string;
  buyerEmail: string | null;
  eventType: LookbookView["event_type"];
  createdAt: string;
  metadata: Record<string, unknown>;
}

export type InventoryEventType =
  | "PO Received"
  | "Manual Adjustment"
  | "Transfer In"
  | "Transfer Out"
  | "Shrinkage"
  | "Usage"
  | "Return";

export interface InventoryEvent {
  id: string;
  product_id: string | null;
  location_id: string | null;
  related_po_id: string | null;
  event_type: InventoryEventType;
  quantity_change: number;
  event_date: string;
  notes: string | null;
  source_system?: string | null;
  source_reference?: string | null;
  created_at: string;
  products?: Product | null;
  locations?: Location | null;
}

export interface CsvImport {
  id: string;
  file_name: string;
  vendor_id: string | null;
  row_count: number;
  successful_rows: number;
  failed_rows: number;
  mapping_config: Record<string, string>;
  import_status: string;
  created_at: string;
  vendors?: Vendor | null;
}

export interface CsvImportError {
  id: string;
  csv_import_id: string;
  row_number: number;
  error_message: string;
  raw_row: Record<string, string | number | null>;
  created_at: string;
}

export interface CsvImportEntityLink {
  id: string;
  csv_import_id: string;
  entity_type: string;
  entity_id: string;
  action_type: "created" | "updated";
  previous_data: Record<string, unknown> | null;
  created_at: string;
}

export interface MappingPreset {
  id: string;
  vendor_id: string | null;
  name: string;
  mapping_config: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export type AlertType =
  | "PO Overdue"
  | "Low Stock"
  | "Low Card Stock"
  | "Projected Stockout"
  | "Vendor Delay Trend"
  | "Unusually Large Order"
  | "Inventory Mismatch"
  | "Missing Delivery Date"
  | "Missing SKU";

export interface Alert {
  id: string;
  alert_type: AlertType;
  severity: "Low" | "Medium" | "High" | "Critical";
  message: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export interface Sop {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  external_url: string | null;
  file_url: string | null;
  tags: string[];
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  related_entity_type: string;
  related_entity_id: string;
  commenter_name: string;
  body: string;
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Win {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_by: string | null;
  reaction_count: number;
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  expertise_tags: string[];
  notes: string | null;
  calendar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingModule {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  video_url: string | null;
  resource_links: Array<{ label: string; url: string }>;
  estimated_minutes: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TrainingProgress {
  id: string;
  module_id: string;
  participant_name: string;
  is_complete: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  id: string;
  app_name: string;
  organization_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  prior_ytd_revenue: number;
  created_at: string;
  updated_at: string;
}

export interface ComplianceRequirementType {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface RetailerComplianceRequirement {
  id: string;
  retailer_id: string;
  requirement_type_id: string;
  status: "Missing" | "Renewing" | "Compliant";
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  retailers?: Retailer | null;
  requirement_types?: ComplianceRequirementType | null;
}

export interface RetailerComplianceDocument {
  id: string;
  retailer_requirement_id: string;
  title: string;
  file_url: string | null;
  uploaded_at: string;
  expires_at: string | null;
}

export interface CapacitySnapshot {
  id: string;
  snapshot_date: string;
  capacity_type: "Manufacturer" | "3PL";
  partner_name: string;
  lane_name: string | null;
  available_units: number;
  committed_units: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShopifyOrder {
  id: string;
  shopify_order_id: string;
  order_name: string;
  source_name: string | null;
  currency_code: string | null;
  order_created_at: string;
  cancelled_at: string | null;
  current_total_price: number;
  created_at: string;
  updated_at: string;
}

export interface ShopifyOrderLineItem {
  id: string;
  shopify_line_item_id: string;
  shopify_order_record_id: string;
  product_id: string | null;
  sku: string | null;
  title: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
  updated_at: string;
}

export interface NormalizedImportRow {
  po_number: string;
  vendor_name: string;
  retailer_name: string;
  location_name: string;
  sku: string;
  product_name: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  order_date: string | null;
  ship_date: string | null;
  eta_date: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  status: PurchaseOrderStatus;
  shipment_status: string;
  invoice_status: "Open" | "Shipped" | "In Route" | "Inventory in Route";
  notes: string;
}

export interface DashboardSnapshot {
  openPoCount: number;
  delayedPoCount: number;
  lowStockCount: number;
  projectedStockoutCount: number;
  vendorRiskCount: number;
  inventoryValue: number;
  weightedForecastValue: number;
  activePipelineValue: number;
  dueIn14DaysCount: number;
  pendingIntakeCount: number;
  avgOrderToArrivalDays: number;
  avgPaidToArrivalDays: number;
  productionTimelineExceptionCount: number;
  productionTimelineTrend: Array<{
    label: string;
    orderToArrivalDays: number | null;
    paidToArrivalDays: number | null;
    projected: boolean;
  }>;
  recentImports: CsvImport[];
  recentAlerts: Alert[];
  recentActivity: ActivityEvent[];
  quickSops: Sop[];
  stockTrend: Array<{ date: string; inventory: number }>;
  inventoryStatusBreakdown: Array<{ label: string; value: number; color: string }>;
  spendByVendor: Array<{ vendor: string; spend: number }>;
  incomingInventoryByManufacturer: Array<{ manufacturer: string; units: number }>;
  revenueYtd: number;
  revenueYtdDeltaPercent: number;
  activeWholesalePipelineValue: number;
  activeWholesalePipelineCount: number;
  awaitingActionCount: number;
  awaitingPoSubmissionCount: number;
  skuOosRisk90dCount: number;
  skuOosRiskCriticalCount: number;
  productionPosInFlightCount: number;
  productionNextLandDate: string | null;
    dtcOrdersTodayCount: number;
    dtcOrdersTodayValue: number;
    dtcShopifyRevenueTrailingYear: number;
    priorRevenueYtd: number;
  projectedRevenueYearEnd: number;
  revenuePaceDeltaPercent: number;
  revenueByChannelYtd: Array<{ channel: string; value: number }>;
  wholesaleChannelRows: Array<{ channel: string; count: number; value: number }>;
  poMapPoints: Array<{
    poId: string;
    poNumber: string;
    account: string;
    city: string | null;
    state: string | null;
    status: PurchaseOrderStatus;
    sourceChannel: string | null;
    value: number;
    units: number;
  }>;
  openWholesalePipelineLedger: Array<{
    poId: string;
    poNumber: string;
    partner: string;
    value: number;
    status: PurchaseOrderStatus;
  }>;
  poStatusCounts: Array<{ status: PurchaseOrderStatus | string; count: number }>;
  missingPoLocationCount: number;
  latePurchaseOrders: Array<{
    poId: string;
    poNumber: string;
    partner: string;
    etaDate: string | null;
    status: PurchaseOrderStatus | string;
    reason: string;
    daysLate: number | null;
  }>;
  behindPaceAccounts: Array<{
    retailerId: string;
    retailer: string;
    currentPace: string;
    comparison: string;
    status: "danger" | "warning" | "healthy";
  }>;
  shippedUnitsLedger: Array<{ poId: string; poNumber: string; partner: string; shipDate: string; source: "shipped" | "ordered"; units: number }>;
  purchaserVelocityAverage: number;
  purchaserVelocityRows: Array<{
    retailerId: string;
    purchaser: string;
    initials: string;
    pairsPerWeek: number;
    deltaVsAverage: number;
    bestPairsPerWeek: number | null;
    bestPeriod: string | null;
    recentPairs: number;
    orderCount: number;
    status: "moving" | "steady" | "stalling";
  }>;
  topSkusYtd: Array<{ sku: string; label: string; value: number; units: number }>;
  revenueProjectionTrend: Array<{
    label: string;
    actualRevenue: number | null;
    projectedRevenue: number;
    priorBaselineRevenue: number;
  }>;
  priorityFeed: Array<{
    id: string;
    title: string;
    detail: string;
    severity: "danger" | "warning" | "info" | "success";
    actionLabel?: string;
  }>;
  pipelineByRetailer: Array<{ retailer: string; value: number }>;
  reorderWindows: Array<{ retailer: string; window: string; productHint: string }>;
  wholesaleRevenueTotal: number;
  dangerSkuCount: number;
  incomingInventoryUnits: number;
  openInvoiceCount: number;
  shippedInvoiceCount: number;
  inventoryInRouteCount: number;
  activeSkusInRoute: number;
  manufacturingSnapshotRows: Array<{
    poId: string;
    poNumber: string;
    manufacturer: string;
    invoiceStatus: string;
    shipmentStatus: string;
    orderDate: string | null;
    etaDate: string | null;
    shipDate: string | null;
    skuCount: number;
    incomingUnits: number;
    reorderWindowSummary: string;
    paymentStatus: "Paid" | "Unpaid";
    manufacturingStatus: "Draft" | "Ordered" | "In Production" | "Shipped" | "Received" | "Delayed";
    inventoryImpactSummary: string;
    inventoryImpactItems: Array<{ productName: string; incomingUnits: number }>;
  }>;
  wholesaleAccounts: Array<{
    retailerId: string;
    retailer: string;
    openInvoices: number;
    shippedInvoices: number;
    recentPoCount: number;
    nextWindow: string;
  }>;
  inventoryAlerts: Array<{
    sku: string;
    productName: string;
    currentQuantity: number;
    incomingQuantity: number;
    status: "danger" | "warning" | "healthy" | "neutral";
    committedQuantity: number;
    riskStatus: "Safe" | "Low Stock" | "Reorder Soon" | "Oversold" | "Incoming Shipment";
  }>;
  skuReorderWindows: Array<{
    sku: string;
    productName: string;
    recommendation: string;
    reorderByDate: string | null;
    currentQuantity: number;
    incomingQuantity: number;
    variantTitle: string | null;
    shortageQuantity: number;
    oversoldQuantity: number;
    isOversold: boolean;
    statusLabel: string;
  }>;
  reorderNowItems: DashboardSnapshot["skuReorderWindows"];
  manufacturingIncoming: Array<{
    id: string;
    poId: string;
    poNumber: string;
    manufacturer: string;
    productName: string;
    sku: string;
    quantityOrdered: number;
    orderedDate: string | null;
    paymentStatus: "Paid" | "Unpaid";
    shipDate: string | null;
    arrivalDate: string | null;
    manufacturingStatus: "Draft" | "Ordered" | "In Production" | "Shipped" | "Received" | "Delayed";
  }>;
}

export interface ForecastMetric {
  averageDailyUsage: number;
  inventoryBurnRate: number;
  projectedDaysRemaining: number | null;
  projectedDepletionDate: string | null;
  reorderPoint: number;
  safetyStock: number;
  suggestedReorderQuantity: number;
}
