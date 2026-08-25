-- MVT Offer Library — Supabase schema (v2)
-- Run this once in the Supabase SQL editor after creating your project
--
-- IF YOU ALREADY RAN v1: skip to the bottom of this file for the migration block

-- ============================================================
-- Main offers table
-- ============================================================
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Status
  status text not null default 'pending_review' check (status in ('published', 'pending_review', 'rejected')),
  source text not null default 'partner' check (source in ('internal', 'partner')),
  sender_email text,
  sender_domain text,
  missing_fields text[],

  -- Conflict between AI-found contact and stored vendor contact
  contact_conflict jsonb,

  -- All 14 offer fields
  vendor text,
  supplier_type text,
  offer_start_date date,
  offer_end_date date,
  travel_start_window text,
  travel_end_window text,
  audience text,
  offer_overview text,
  full_details text,
  book_through text,
  voyage_list text,
  offer_details text,
  client_facing_content text,
  contact text,

  -- Attachments and source data
  attachment_urls text[],
  original_subject text,
  original_body text,
  raw_extraction jsonb,

  -- Added after the v2 schema. These already exist in the live database.
  pinned boolean default false,
  tags text[]
);

create index offers_status_idx on public.offers(status);
create index offers_dates_idx on public.offers(offer_start_date, offer_end_date);
create index offers_vendor_idx on public.offers(vendor);
create index offers_supplier_type_idx on public.offers(supplier_type);

-- ============================================================
-- Vendor contacts memory table
-- ============================================================
create table public.vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  vendor_normalized text unique not null,
  vendor_display text not null,
  contact text not null,
  updated_at timestamptz default now(),
  source_offer_id uuid references public.offers(id) on delete set null
);

create index vendor_contacts_vendor_idx on public.vendor_contacts(vendor_normalized);

-- ============================================================
-- Auto-update updated_at
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger offers_updated_at
  before update on public.offers
  for each row execute function update_updated_at();

create trigger vendor_contacts_updated_at
  before update on public.vendor_contacts
  for each row execute function update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.offers enable row level security;
alter table public.vendor_contacts enable row level security;

-- Public can read published offers, BUT only within their date window
create policy "Public can view active published offers"
  on public.offers for select
  using (
    status = 'published'
    and (offer_start_date is null or offer_start_date <= current_date)
    and (offer_end_date is null or offer_end_date >= current_date)
  );

-- vendor_contacts is admin/server only — no public read policy
-- Service role bypasses RLS automatically

-- ============================================================
-- MIGRATION BLOCK — only run if you previously ran the v1 schema
-- ============================================================
-- If you're starting fresh, ignore this. If you already ran the older schema, run only these:
--
-- alter table public.offers add column if not exists contact_conflict jsonb;
-- drop policy if exists "Public can view published offers" on public.offers;
-- create policy "Public can view active published offers"
--   on public.offers for select
--   using (
--     status = 'published'
--     and (offer_start_date is null or offer_start_date <= current_date)
--     and (offer_end_date is null or offer_end_date >= current_date)
--   );
--
-- create table public.vendor_contacts (
--   id uuid primary key default gen_random_uuid(),
--   vendor_normalized text unique not null,
--   vendor_display text not null,
--   contact text not null,
--   updated_at timestamptz default now(),
--   source_offer_id uuid references public.offers(id) on delete set null
-- );
-- create index vendor_contacts_vendor_idx on public.vendor_contacts(vendor_normalized);
-- alter table public.vendor_contacts enable row level security;
-- create trigger vendor_contacts_updated_at
--   before update on public.vendor_contacts
--   for each row execute function update_updated_at();

-- ============================================================
-- MIGRATION: pinned + tags (only if your live DB predates them)
-- The MVT live database ALREADY has these. Do not run against it.
-- Kept here so a fresh rebuild from this file matches production.
-- ============================================================
-- alter table public.offers add column if not exists pinned boolean default false;
-- alter table public.offers add column if not exists tags text[];
