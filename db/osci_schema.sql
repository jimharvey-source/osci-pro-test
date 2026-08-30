-- =====================================================================
-- osci schema  ·  OSCI Pro paid report
--
-- Two tables. runs holds the scoring payload the buyer produced. orders
-- holds what Stripe says happened to it. Nothing but the service role can
-- read or write either: row level security is on and there are no policies,
-- so the anon and authenticated roles see nothing at all.
--
-- Why a store exists at all: the Pro scoring payload measures ~3.7 KB, and
-- Stripe caps a metadata value at 500 characters. The free tool's trick of
-- carrying the whole score set through checkout cannot survive sixty items.
-- =====================================================================

create schema if not exists osci;

create table if not exists osci.runs (
  token            text primary key,
  name             text not null,
  email            text not null,
  scoring          jsonb not null,
  scoring_version  text,
  created_at       timestamptz not null default now()
);

create table if not exists osci.orders (
  stripe_session_id         text primary key,
  stripe_payment_intent_id  text,
  token                     text not null references osci.runs(token),
  status                    text not null
                              check (status in ('pending','paid','refunded','failed')),
  amount_total              integer,
  currency                  text,
  promo_applied             boolean not null default false,
  email                     text,
  paid_at                   timestamptz,
  first_generated_at        timestamptz,
  last_generated_at         timestamptz,
  generation_count          integer not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists orders_token_idx
  on osci.orders (token);
create index if not exists orders_status_idx
  on osci.orders (status);
create index if not exists orders_payment_intent_idx
  on osci.orders (stripe_payment_intent_id);
create index if not exists runs_email_idx
  on osci.runs (email);

alter table osci.runs   enable row level security;
alter table osci.orders enable row level security;

-- No policies by design. The service role bypasses row level security and is
-- the only thing that touches these tables. Adding a SELECT policy later
-- would open them to the anon key, which is public.

grant usage on schema osci to service_role;
grant all on all tables in schema osci to service_role;
alter default privileges in schema osci
  grant all on tables to service_role;
