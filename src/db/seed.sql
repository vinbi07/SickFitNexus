insert into public.app_settings (app_name, organization_name, logo_url, primary_color, secondary_color)
values (
  'SickFit Nexus',
  'SickFit',
  'https://cdn.shopify.com/s/files/1/0582/5324/6628/files/SickFit_-_RED_a5c4761e-6396-407b-894d-ac77e4b70c84.png?v=1768945192',
  '#e72027',
  '#111111'
)
on conflict do nothing;

insert into public.vendors (name, contact_email, average_delay_days, reliability_score, notes)
values
  ('Redline Medical Supply', 'ops@redlinemedical.com', 4, 82, 'Primary diagnostics supplier'),
  ('Peak Wellness Distributors', 'support@peakwellness.co', 2, 89, 'Strong fill-rate on consumables'),
  ('AeroLab Recovery Systems', 'shipping@aerolab.io', 6, 68, 'Watch for lead-time variability')
on conflict do nothing;

insert into public.locations (name, type, address)
values
  ('Dallas DC', 'Distribution Center', '2101 Logistics Way, Dallas, TX'),
  ('Austin Clinic', 'Clinic', '900 Health Ave, Austin, TX'),
  ('Chicago Airport Lab', 'Lab', '1 Terminal Dr, Chicago, IL')
on conflict do nothing;

insert into public.retailers (name, status, primary_contact_name, primary_contact_email, ordering_cadence_days, next_reorder_start, next_reorder_end, notes)
values
  ('CVS Health', 'Active', 'Jajuan', 'jjohnson@cvs.com', 38, '2026-05-19', '2026-05-25', 'Healthcare retail channel'),
  ('Navy Exchange', 'Active', 'Antoine', 'antoine@navyexchange.org', 45, '2026-05-27', '2026-06-02', '33 locations'),
  ('Dollar General', 'Pilot', 'Antoine', 'supplierdiversity@dollargeneral.com', 30, '2026-05-21', '2026-05-28', 'Private label pilot')
on conflict do nothing;

insert into public.products (sku, name, category, unit_cost, current_inventory, safety_stock)
values
  ('KIT-100', 'Everyday Compression Socks', 'Apparel', 42, 165, 60),
  ('SUP-220', 'Military Compression Socks', 'Apparel', 11, 72, 45),
  ('MED-310', 'Medical Grade Compression Socks', 'Apparel', 7, 38, 50),
  ('LAB-410', 'Slouch Socks', 'Apparel', 58, 24, 30)
on conflict (sku) do nothing;

update public.products
set
  shopify_handle = lower(replace(name, ' ', '-')),
  shopify_storefront_url = 'https://sickfitofficial.com/products/' || lower(replace(name, ' ', '-')),
  shopify_admin_url = 'https://admin.shopify.com/store/sickfit/products/' || sku,
  is_shopify_synced = true,
  last_shopify_sync_at = now()
where shopify_storefront_url is null;

insert into public.compliance_requirement_types (name, description)
values
  ('COI', 'Certificate of insurance'),
  ('W-9', 'Tax documentation'),
  ('FDA', 'FDA related compliance'),
  ('Packaging', 'Retailer packaging standards')
on conflict (name) do nothing;

insert into public.capacity_snapshots (snapshot_date, capacity_type, partner_name, lane_name, available_units, committed_units, notes)
values
  ('2026-05-10', 'Manufacturer', 'Redline Medical Supply', 'Compression socks', 12000, 7600, 'Stable lane'),
  ('2026-05-10', '3PL', '3PL Discovery Placeholder', 'Outbound retail fulfillment', 8000, 0, 'Manual tracking until API confirmed')
on conflict do nothing;

insert into public.sops (title, category, description, external_url, tags, is_favorite)
values
  ('Receiving Checklist', 'Warehouse', 'Inbound receiving checklist for PO validation and put-away.', 'https://example.com/receiving-checklist', array['receiving','warehouse'], true),
  ('Vendor Escalation Path', 'Procurement', 'Escalation guide for late or incomplete shipments.', 'https://example.com/vendor-escalation', array['vendors','escalation'], true),
  ('Cycle Count SOP', 'Inventory', 'Quick guide for manual counts and inventory adjustments.', 'https://example.com/cycle-count', array['inventory'], false)
on conflict do nothing;

insert into public.people (name, role, company, email, expertise_tags, notes)
values
  ('Paden Sickles', 'CEO', 'SickFit', 'psickles@sickfitofficial.com', array['business','vendors'], 'Controls overall strategy and operations'),
  ('Joey Suliguin', 'CTO', 'SickFit', 'jsuliguin@sickfitofficial.com', array['training','technology'], 'Leads product development and training initiatives'),
  ('Rena Vu', 'Sales Lead', 'SickFit', 'rvu@sickfitofficial.com', array['sales','marketing'], 'Leads sales efforts and customer relationships')
on conflict do nothing;

insert into public.training_modules (title, category, description, video_url, resource_links, estimated_minutes, sort_order)
values
  ('PO Import Basics', 'CSV Import', 'How to clean and upload vendor PO exports into SickFit Nexus.', 'https://example.com/video/po-import', '[{"label":"CSV template","url":"https://example.com/csv-template"}]'::jsonb, 12, 1),
  ('Inventory Adjustment Workflow', 'Inventory', 'Best practices for manual adjustments and mismatch review.', 'https://example.com/video/inventory-adjustment', '[{"label":"Adjustment SOP","url":"https://example.com/sop"}]'::jsonb, 10, 2)
on conflict do nothing;

insert into public.activity_events (event_type, entity_type, title, description, metadata)
values
  ('seeded', 'system', 'Seed data loaded', 'Initial MVP operational data was loaded into the workspace.', '{"source":"seed.sql"}'::jsonb);
