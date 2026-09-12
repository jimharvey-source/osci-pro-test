-- =====================================================================
-- osci schema  ·  cohort codes
--
-- A programme code lets a named group get the Pro report without paying.
-- One row per programme. The code is what a participant types; the label
-- is what Jim reads in the orders table afterwards.
--
-- Redemption goes through redeem_cohort_code(), one statement, so two
-- participants pressing the button in the same second cannot both take the
-- last use. The service role is still the only thing that touches any of it.
--
-- Run once in the Supabase SQL editor. Safe to run again.
-- =====================================================================

create table if not exists osci.cohort_codes (
  code        text primary key,              -- stored upper case, no spaces
  label       text not null,                 -- "Givaudan Budapest, Sept 2026"
  max_uses    integer,                       -- null means no cap
  uses        integer not null default 0,
  active      boolean not null default true,
  expires_at  timestamptz,                   -- null means never
  created_at  timestamptz not null default now()
);

-- A cohort order has no Stripe session. The primary key column keeps its
-- name, and a cohort order carries a "coh_" token there instead. This
-- column says which programme it came from, and null means a real sale.
alter table osci.orders
  add column if not exists cohort_code text references osci.cohort_codes(code);

create index if not exists orders_cohort_code_idx
  on osci.orders (cohort_code);

alter table osci.cohort_codes enable row level security;
-- No policies by design, as with runs and orders.

-- Takes one use if the code is live, and returns the label. Returns no row
-- if the code is unknown, switched off, expired, or used up. The caller
-- cannot tell those apart, on purpose: a stranger guessing codes learns
-- nothing from the reply.
create or replace function osci.redeem_cohort_code(p_code text)
returns table (label text)
language sql
security definer
set search_path = osci
as $$
  update osci.cohort_codes
     set uses = uses + 1
   where code = upper(trim(p_code))
     and active
     and (max_uses is null or uses < max_uses)
     and (expires_at is null or expires_at > now())
  returning cohort_codes.label;
$$;

-- Gives the use back when the order row could not be written.
create or replace function osci.release_cohort_code(p_code text)
returns void
language sql
security definer
set search_path = osci
as $$
  update osci.cohort_codes
     set uses = greatest(uses - 1, 0)
   where code = upper(trim(p_code));
$$;

revoke all on function osci.redeem_cohort_code(text) from public, anon, authenticated;
revoke all on function osci.release_cohort_code(text) from public, anon, authenticated;
grant execute on function osci.redeem_cohort_code(text) to service_role;
grant execute on function osci.release_cohort_code(text) to service_role;
grant all on osci.cohort_codes to service_role;

-- ---------------------------------------------------------------------
-- Adding a programme. Copy, edit, run.
--
-- insert into osci.cohort_codes (code, label, max_uses, expires_at)
-- values ('GIVAUDAN26', 'Givaudan Budapest, September 2026', 30, '2026-12-31');
--
-- Switching one off:  update osci.cohort_codes set active = false where code = 'GIVAUDAN26';
-- Who used it:        select email, paid_at from osci.orders where cohort_code = 'GIVAUDAN26';
-- ---------------------------------------------------------------------
