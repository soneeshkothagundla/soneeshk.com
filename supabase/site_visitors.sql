-- Unique-visitor counter for soneeshk.com: one row per browser (random id kept in localStorage).
-- Anon has no direct table access; it goes through visit() only.
create table if not exists public.site_visitors (
  id         bigserial   primary key,
  visitor    uuid        not null unique,
  visits     int         not null default 1,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
alter table public.site_visitors enable row level security;
revoke all on public.site_visitors from anon, authenticated;

-- Records a visit (pass null to just read) and returns the total plus this visitor's number.
-- Tracking started 2026-10-05; `baseline` is an estimate of visitors before that, from engagement:
-- 93 tapbacks (40 on the busiest bubble, and one per visitor per bubble, so >=40 reactors; ~60 at
-- ~1.5 reactions each) and 53 "Text back" messages, assuming roughly half of visitors interacted -> ~120.
create or replace function public.visit(p_visitor uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare my_id bigint; baseline constant int := 120;
begin
  if p_visitor is not null then
    insert into site_visitors (visitor) values (p_visitor)
    on conflict (visitor) do update set visits = site_visitors.visits + 1, last_seen = now()
    returning id into my_id;
  end if;
  return json_build_object(
    'total', baseline + (select count(*) from site_visitors),
    'you',   case when my_id is null then null else baseline + (select count(*) from site_visitors where id <= my_id) end
  );
end;
$$;

revoke all on function public.visit(uuid) from public;
grant execute on function public.visit(uuid) to anon, authenticated;
