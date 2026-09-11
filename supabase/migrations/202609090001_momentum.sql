-- Run once in the Supabase SQL editor as project owner.
-- Membership is provisioned only by the owner; the browser cannot add members.
begin;
create table public.momentum_members (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.momentum_members enable row level security;
revoke all on public.momentum_members from public, anon, authenticated;
grant select on public.momentum_members to authenticated;
create policy member_self on public.momentum_members for select to authenticated
  using (user_id = (select auth.uid()));

create table public.momentum_agendas (
  user_id uuid primary key references public.momentum_members(user_id) on delete cascade,
  data jsonb not null,
  revision bigint not null check (revision between 1 and 9007199254740991),
  write_id uuid not null,
  constraint agenda_shape check (
    jsonb_typeof(data) = 'object'
    and data ?& array['habits','tasks','blocks','sessions','log']
    and jsonb_typeof(data->'habits')='array'
    and jsonb_typeof(data->'tasks')='array'
    and jsonb_typeof(data->'blocks')='array'
    and jsonb_typeof(data->'sessions')='array'
    and jsonb_typeof(data->'log')='object'
    and octet_length(data::text) <= 6291456
  )
);
alter table public.momentum_agendas enable row level security;
revoke all on public.momentum_agendas from public, anon, authenticated;
grant select, insert, update on public.momentum_agendas to authenticated;
create policy agenda_read on public.momentum_agendas for select to authenticated
  using (user_id=(select auth.uid()) and exists(select 1 from public.momentum_members m where m.user_id=(select auth.uid())));
create policy agenda_create on public.momentum_agendas for insert to authenticated
  with check (user_id=(select auth.uid()) and exists(select 1 from public.momentum_members m where m.user_id=(select auth.uid())));
create policy agenda_update on public.momentum_agendas for update to authenticated
  using (user_id=(select auth.uid()) and exists(select 1 from public.momentum_members m where m.user_id=(select auth.uid())))
  with check (user_id=(select auth.uid()) and exists(select 1 from public.momentum_members m where m.user_id=(select auth.uid())));
commit;
