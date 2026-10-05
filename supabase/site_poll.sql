-- "On a scale of 1-10, how much do you like this personal website?" poll on soneeshk.com.
-- Anon has no direct table access; it votes and reads totals only through the two RPCs below.
create table if not exists public.site_poll_votes (
  poll       text        not null default 'like-site',
  voter      uuid        not null,
  score      smallint    not null check (score between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (poll, voter)
);
alter table public.site_poll_votes enable row level security;
revoke all on public.site_poll_votes from anon, authenticated;

-- Totals per score, 1..10 (zeros included), plus vote count and average.
create or replace function public.poll_results(p_poll text default 'like-site')
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'counts', (select json_agg(coalesce(c.n, 0) order by s)
               from generate_series(1, 10) s
               left join (select score, count(*) n from site_poll_votes where poll = p_poll group by score) c on c.score = s),
    'total',  (select count(*) from site_poll_votes where poll = p_poll),
    'avg',    (select round(avg(score)::numeric, 1) from site_poll_votes where poll = p_poll)
  );
$$;

-- One vote per browser (voter id kept in localStorage); voting again changes the vote.
create or replace function public.poll_vote(p_voter uuid, p_score int, p_poll text default 'like-site')
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_poll <> 'like-site' then raise exception 'unknown poll'; end if;
  if p_score is null or p_score not between 1 and 10 then raise exception 'score must be 1-10'; end if;
  insert into site_poll_votes (poll, voter, score) values (p_poll, p_voter, p_score)
  on conflict (poll, voter) do update set score = excluded.score, updated_at = now();
  return poll_results(p_poll);
end;
$$;

revoke all on function public.poll_results(text) from public;
revoke all on function public.poll_vote(uuid, int, text) from public;
grant execute on function public.poll_results(text) to anon, authenticated;
grant execute on function public.poll_vote(uuid, int, text) to anon, authenticated;
