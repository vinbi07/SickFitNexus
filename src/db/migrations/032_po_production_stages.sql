-- Migration 032: Factory production stages on purchase orders
-- Tracks where a manufacturer PO's goods physically are (Sent to vendor → Paid →
-- In production → Packing → Shipped → At US port → Received), separate from the
-- approval/workflow `status`. Paid, Shipped and Received keep living in
-- invoice_paid_at, ship_date and actual_delivery_date; stage_dates holds the
-- remaining stage dates. Expected dates are computed from supply_chain_settings
-- (see src/utils/productionStage.ts).

alter table public.purchase_orders
  add column if not exists ship_mode text not null default 'Sea',
  add column if not exists freight_cost numeric(12,2),
  add column if not exists production_stage text,
  add column if not exists stage_dates jsonb not null default '{}'::jsonb;

alter table public.purchase_orders drop constraint if exists purchase_orders_ship_mode_check;
alter table public.purchase_orders
  add constraint purchase_orders_ship_mode_check check (ship_mode in ('Sea', 'Air'));

alter table public.purchase_orders drop constraint if exists purchase_orders_production_stage_check;
alter table public.purchase_orders
  add constraint purchase_orders_production_stage_check check (
    production_stage is null or production_stage in (
      'Sent to vendor', 'Paid', 'In production', 'Packing', 'Shipped', 'At US port', 'Received'
    )
  );

create index if not exists idx_purchase_orders_production_stage on public.purchase_orders(production_stage);
