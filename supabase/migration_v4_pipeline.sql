-- MVT Offer Library: v4 pipeline migration (Nov 2026)
--
-- Run PART 1 in the Supabase SQL editor BEFORE deploying the v4 code.
-- PART 2 is cleanup of existing rows. Run each preview SELECT first, look at
-- the rows, then run the UPDATE under it.

-- ============================================================
-- PART 1: schema (safe to run more than once)
-- ============================================================

-- New columns on offers
alter table public.offers add column if not exists end_date_source text;
alter table public.offers add column if not exists properties text[];
alter table public.offers add column if not exists evidence jsonb;
alter table public.offers add column if not exists confidence integer;
alter table public.offers add column if not exists kind_certainty text;
alter table public.offers add column if not exists review_reasons text[];
alter table public.offers add column if not exists auto_action text;

do $$ begin
  alter table public.offers add constraint offers_end_date_source_check
    check (end_date_source is null or end_date_source in ('booking_deadline', 'travel_end', 'estimated', 'manual'));
exception when duplicate_object then null; end $$;

-- Supplier news (the /news page)
create table if not exists public.supplier_updates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  status text not null default 'published' check (status in ('published', 'hidden')),
  vendor text,
  supplier_type text,
  category text default 'General',
  headline text,
  summary text not null,
  details text,
  properties text[],
  link text,
  event_date date,
  contact text,
  expires_on date not null default ((now() at time zone 'America/Los_Angeles')::date + 90),
  sender_email text,
  original_subject text,
  original_body text,
  from_offer_id uuid references public.offers(id) on delete set null
);
create index if not exists supplier_updates_created_idx on public.supplier_updates(created_at desc);
alter table public.supplier_updates enable row level security;
drop policy if exists "Public can view current supplier updates" on public.supplier_updates;
create policy "Public can view current supplier updates"
  on public.supplier_updates for select
  using (
    status = 'published'
    and expires_on >= (now() at time zone 'America/Los_Angeles')::date
  );

-- Admin settings (the two sliders)
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value)
values ('pipeline', '{"publish_threshold": 75, "merge_threshold": 90}')
on conflict (key) do nothing;

-- Everything done without a person, with enough to undo it
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  action text not null,
  offer_id uuid references public.offers(id) on delete set null,
  target_id uuid references public.offers(id) on delete set null,
  update_id uuid,
  vendor text,
  score integer,
  details jsonb,
  undone_at timestamptz
);
create index if not exists activity_log_created_idx on public.activity_log(created_at desc);
alter table public.activity_log enable row level security;
-- app_settings and activity_log have no public policy: server only.


-- ============================================================
-- PART 2: cleanup of existing rows
-- ============================================================

-- 2a. Offers with no end date whose travel end is a real date.
--     Preview:
select id, status, vendor, travel_end_window
from public.offers
where offer_end_date is null
  and status in ('pending_review', 'published')
  and (travel_end_window ~ '^\d{4}-\d{2}-\d{2}$' or travel_end_window ~ '^\d{1,2}/\d{1,2}/\d{4}$');

--     Apply:
update public.offers
set offer_end_date = case
      when travel_end_window ~ '^\d{4}-\d{2}-\d{2}$' then travel_end_window::date
      else to_date(travel_end_window, 'MM/DD/YYYY')
    end,
    end_date_source = 'travel_end'
where offer_end_date is null
  and status in ('pending_review', 'published')
  and (travel_end_window ~ '^\d{4}-\d{2}-\d{2}$' or travel_end_window ~ '^\d{1,2}/\d{1,2}/\d{4}$');

-- 2b. Pending offers still with no end date: estimate 60 days from arrival.
--     (Some will already be in the past, which is accurate: they are stale.)
--     Preview:
select id, vendor, created_at::date as arrived,
       ((created_at at time zone 'America/Los_Angeles')::date + 60) as estimated_end
from public.offers
where offer_end_date is null and status = 'pending_review';

--     Apply:
update public.offers
set offer_end_date = (created_at at time zone 'America/Los_Angeles')::date + 60,
    end_date_source = 'estimated'
where offer_end_date is null and status = 'pending_review';

-- 2c. Remove images from attachments (decision: PDFs and documents only).
--     Preview: offers that carry at least one image file.
select id, status, vendor, attachment_urls
from public.offers
where exists (
  select 1 from unnest(attachment_urls) u
  where u ~* '\.(png|jpe?g|gif|webp|bmp|heic|tiff?)(\?.*)?$'
);

--     Apply:
update public.offers o
set attachment_urls = nullif(array(
      select u from unnest(o.attachment_urls) u
      where u !~* '\.(png|jpe?g|gif|webp|bmp|heic|tiff?)(\?.*)?$'
    ), '{}')
where exists (
  select 1 from unnest(o.attachment_urls) u
  where u ~* '\.(png|jpe?g|gif|webp|bmp|heic|tiff?)(\?.*)?$'
);

-- 2d. Published offers whose end date is well before the day they arrived.
--     Usually a wrong year from the AI (e.g. Holland America 2025-12-03 on a
--     Nov 2026 email). Review only: fix these by hand in the admin.
select id, vendor, created_at::date as arrived, offer_end_date, left(offer_overview, 100) as overview
from public.offers
where status = 'published'
  and offer_end_date < (created_at at time zone 'America/Los_Angeles')::date - 30
  and created_at > now() - interval '90 days'
order by created_at desc;
