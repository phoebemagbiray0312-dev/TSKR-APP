-- TSKR core schema (Developer Guide, Nov 7 2026)
create extension if not exists pgcrypto;

-- ---------- enums ----------
create type public.app_role       as enum ('client','tasker');
create type public.account_status as enum ('active','deactivated','deleted');
create type public.tasker_status  as enum ('none','pending','active','rejected','paused');
create type public.client_plan    as enum ('free','plus');
create type public.booking_status as enum (
  'requested','chatting','declined_by_tasker','offer_sent','offer_accepted','on_the_way',
  'arrived','final_price_sent','ready','in_progress','completed','cancelled');
create type public.coin_kind as enum ('signup_bonus','purchase','booking_fee','delivery_fee','skill_charge','penalty','adjustment');

-- ---------- config (section 11: every number admin-editable) ----------
create table public.app_config (
  key         text primary key,
  value       jsonb not null,
  status      text not null default 'agreed' check (status in ('agreed','placeholder')),
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- ---------- users ----------
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  first_name         text,
  last_name          text,
  email              text,
  email_verified_at  timestamptz,
  phone              text unique,                -- 10 digits, e.g. 9171234567 (+63 implied)
  phone_verified_at  timestamptz,
  signup_role        public.app_role not null default 'client',
  is_tasker          boolean not null default false,
  tasker_status      public.tasker_status not null default 'none',
  plan               public.client_plan not null default 'free',
  plus_until         timestamptz,
  emergency_contact_name  text,
  emergency_contact_phone text,
  referral_code      text unique,
  referred_by        uuid references public.profiles(id),
  status             public.account_status not null default 'active',
  closed_at          timestamptz,
  close_reason       text,
  close_note         text,
  linked_previous_id uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role    text not null default 'admin' check (role in ('admin','verifier','support','superadmin')),
  created_at timestamptz not null default now()
);

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text,
  created_at timestamptz not null default now()
);

-- ---------- legal & consent (2.3) ----------
create table public.policy_documents (
  id             uuid primary key default gen_random_uuid(),
  doc_type       text not null check (doc_type in ('terms','privacy','id_consent')),
  role           public.app_role not null,
  version        text not null,
  title          text not null,
  effective_date date not null,
  sections       jsonb not null default '[]',      -- [{h, p}]
  is_current     boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (doc_type, role, version)
);

create table public.consents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  document_id  uuid not null references public.policy_documents(id),
  consent_type text not null,
  role         public.app_role not null,
  version      text not null,
  app_version  text,
  accepted_at  timestamptz not null default now()
);

-- ---------- OTP (email code + SMS at sign-up only) ----------
create table public.otp_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  channel     text not null check (channel in ('email','sms')),
  target      text not null,
  code_hash   text not null,
  attempts    int not null default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------- tasker verification (2.2) ----------
create table public.tasker_verifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  id1_type         text,
  id1_image_path   text,
  id1_ocr          jsonb,           -- {name, birthdate, id_number_masked, address}
  id2_type         text,
  id2_image_path   text,
  id2_ocr          jsonb,
  selfie_path      text,
  face_match_score numeric,
  flags            text[] not null default '{}',  -- name_mismatch, birthday_mismatch, face_mismatch
  status           text not null default 'draft' check (status in ('draft','submitted','approved','rejected','flagged')),
  submitted_at     timestamptz,
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  review_note      text,
  created_at       timestamptz not null default now()
);

create table public.kyc_access_log (
  id bigserial primary key,
  admin_id uuid not null references public.profiles(id),
  verification_id uuid not null references public.tasker_verifications(id),
  action text not null,
  created_at timestamptz not null default now()
);

-- ---------- skills (4.1, 4.2) ----------
create table public.skill_categories (
  id    serial primary key,
  name  text not null unique,
  sort  int not null default 0
);

create table public.skills (
  id          serial primary key,
  category_id int not null references public.skill_categories(id),
  name        text not null unique,
  is_delivery boolean not null default false,
  needs_license boolean not null default false,
  is_active   boolean not null default true
);

create table public.banned_terms (
  term text primary key,
  kind text not null default 'personal_service'   -- personal_service | passenger
);

create table public.tasker_profiles (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  title          text,
  bio            text,
  years_experience int,
  photo_path     text,
  radius_km      numeric(3,1) not null default 3 check (radius_km between 1 and 6),
  base_lat       double precision,
  base_lng       double precision,
  area_label     text,
  is_online      boolean not null default false,
  availability   jsonb not null default '{"days":[1,2,3,4,5,6],"from":"08:00","to":"18:00"}',
  payment_qr_path   text,
  qr_wallet_type    text check (qr_wallet_type in ('gcash','maya','bank')),
  qr_account_name   text,
  qr_status         text not null default 'none' check (qr_status in ('none','pending','approved','rejected')),
  rating_avg     numeric(3,2) not null default 0,
  rating_count   int not null default 0,
  jobs_done      int not null default 0,
  updated_at     timestamptz not null default now()
);

create table public.tasker_skills (
  id          uuid primary key default gen_random_uuid(),
  tasker_id   uuid not null references public.profiles(id) on delete cascade,
  skill_id    int references public.skills(id),
  custom_name text,
  base_fee    numeric(10,2) not null check (base_fee > 0),
  duration_min int,
  license_path text,
  status      text not null default 'active' check (status in ('active','pending_review','rejected','hidden')),
  slot        int not null,                      -- 1..5; 3-5 are extra (paid weekly)
  created_at  timestamptz not null default now(),
  check (skill_id is not null or custom_name is not null)
);
create unique index tasker_skills_unique_skill on public.tasker_skills(tasker_id, skill_id) where skill_id is not null;

create table public.portfolio_photos (
  id uuid primary key default gen_random_uuid(),
  tasker_id uuid not null references public.profiles(id) on delete cascade,
  photo_path text not null,
  taken_at timestamptz not null default now()
);

-- ---------- addresses (10.4) ----------
create table public.addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  label      text not null check (label in ('home','work','partner','other')),
  custom_label text,
  street     text not null,
  unit       text,
  barangay   text not null,
  city       text not null,
  landmark   text,
  lat        double precision not null,
  lng        double precision not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- coins (3.1) : ledger only, balance computed ----------
create table public.coin_ledger (
  id         bigserial primary key,
  tasker_id  uuid not null references public.profiles(id),
  amount     int not null,                 -- + credit / - debit
  kind       public.coin_kind not null,
  booking_id uuid,
  reference  text,
  note       text,
  created_at timestamptz not null default now()
);
create index coin_ledger_tasker on public.coin_ledger(tasker_id, created_at desc);

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id),
  purpose        text not null check (purpose in ('coins','plus')),
  amount_php     numeric(10,2) not null,
  coins          int,
  gateway        text not null default 'demo',  -- demo | paymongo | xendit
  gateway_txn_id text unique,
  method         text,                           -- gcash | maya | card
  status         text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  created_at     timestamptz not null default now(),
  paid_at        timestamptz
);

-- ---------- bookings (6) ----------
create table public.bookings (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique default ('BK-' || upper(substr(md5(random()::text),1,6))),
  client_id        uuid not null references public.profiles(id),
  tasker_id        uuid not null references public.profiles(id),
  status           public.booking_status not null default 'requested',
  when_type        text not null default 'now' check (when_type in ('now','scheduled')),
  scheduled_at     timestamptz,
  address          jsonb not null,               -- snapshot of service / pickup address
  dropoff_address  jsonb,                        -- deliveries only
  is_delivery      boolean not null default false,
  delivery_ack     boolean not null default false,
  is_repeat_client boolean not null default false,
  starting_total   numeric(10,2) not null default 0,
  initial_offer    numeric(10,2),
  offer_photo_verified boolean not null default false,
  final_price      numeric(10,2),
  final_price_reason text,
  final_price_photo  text,
  arrival_code     text,
  items_checked    boolean not null default false,
  proof_of_delivery_path text,
  fee_coins        int,
  payment_method   text check (payment_method in ('cash','qr')),
  payment_reference text,
  cancelled_by     uuid references public.profiles(id),
  cancel_reason    text,
  cancel_note      text,
  cancel_result    text,                         -- free | free_this_month | fee_100 | strike | no_strike
  offer_accepted_at timestamptz,
  arrived_at       timestamptz,
  started_at       timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  eta_at           timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index bookings_client on public.bookings(client_id, created_at desc);
create index bookings_tasker on public.bookings(tasker_id, created_at desc);

create table public.booking_items (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  tasker_skill_id uuid references public.tasker_skills(id),
  name       text not null,
  qty        int not null default 1 check (qty > 0),
  unit_price numeric(10,2) not null
);

create table public.booking_events (
  id          bigserial primary key,
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  from_status public.booking_status,
  to_status   public.booking_status not null,
  actor_id    uuid,
  note        text,
  created_at  timestamptz not null default now()
);

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  sender_id   uuid references public.profiles(id),
  kind        text not null default 'text' check (kind in ('text','photo','offer','final_price','system','photo_request')),
  body        text,
  photo_path  text,
  amount      numeric(10,2),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index messages_booking on public.messages(booking_id, created_at);

create table public.location_pings (           -- only during active booking; purged after job ends
  id         bigserial primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id    uuid not null references public.profiles(id),
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

create index location_pings_booking on public.location_pings(booking_id, created_at desc);

-- ---------- cancellations, fees, strikes (8) ----------
create table public.cancellation_fees (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null unique references public.bookings(id),
  client_id    uuid not null references public.profiles(id),
  tasker_id    uuid not null references public.profiles(id),
  amount_php   numeric(10,2) not null,
  status       text not null default 'unpaid' check (status in ('unpaid','submitted','received','not_received','settled')),
  reference_no text,
  submitted_at timestamptz,
  answered_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table public.strikes (
  id         uuid primary key default gen_random_uuid(),
  tasker_id  uuid not null references public.profiles(id),
  booking_id uuid references public.bookings(id),
  reason     text not null,
  weight     int not null default 1,          -- no-show = 2
  created_at timestamptz not null default now()
);

create table public.tasker_pauses (
  id uuid primary key default gen_random_uuid(),
  tasker_id uuid not null references public.profiles(id),
  reason text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null
);

-- ---------- reviews, favorites, blocks (10) ----------
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id),
  reviewer_id uuid not null references public.profiles(id),
  reviewee_id uuid not null references public.profiles(id),
  direction   text not null check (direction in ('client_to_tasker','tasker_to_client')),
  rating      int not null check (rating between 1 and 5),
  tags        text[] not null default '{}',
  body        text,
  photos      text[] not null default '{}',
  created_at  timestamptz not null default now(),
  unique (booking_id, direction)
);

create table public.favorites (
  client_id uuid not null references public.profiles(id) on delete cascade,
  tasker_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, tasker_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

-- ---------- safety & support (9) ----------
create sequence public.ticket_seq start 4000;
create table public.tickets (
  id          uuid primary key default gen_random_uuid(),
  ticket_no   text not null unique default ('TKT-' || nextval('public.ticket_seq')),
  kind        text not null check (kind in ('report_user','booking_problem','sos','prohibited_item','unsafe','other')),
  priority    text not null default 'normal' check (priority in ('normal','high')),
  reporter_id uuid not null references public.profiles(id),
  reported_id uuid references public.profiles(id),
  booking_id  uuid references public.bookings(id),
  reasons     text[] not null default '{}',
  body        text,
  photo_path  text,
  location    jsonb,
  status      text not null default 'open' check (status in ('open','in_review','resolved','closed')),
  created_at  timestamptz not null default now()
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  data       jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on public.notifications(user_id, created_at desc);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id),
  referee_id  uuid not null unique references public.profiles(id),
  rewarded_at timestamptz,
  created_at  timestamptz not null default now()
);

-- RLS on everything immediately (policies in 0002)
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop; end $$;
