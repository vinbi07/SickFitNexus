-- Migration 033: Optional "Labels created" production stage
-- The freight forwarder creates US delivery labels (UPS/FedEx) after goods
-- leave the factory and before they arrive. It sits between Shipped and
-- At US port and can be skipped. Its date lives in stage_dates.

alter table public.purchase_orders drop constraint if exists purchase_orders_production_stage_check;
alter table public.purchase_orders
  add constraint purchase_orders_production_stage_check check (
    production_stage is null or production_stage in (
      'Sent to vendor', 'Paid', 'In production', 'Packing', 'Shipped', 'Labels created', 'At US port', 'Received'
    )
  );
