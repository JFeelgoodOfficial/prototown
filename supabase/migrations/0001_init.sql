-- Async multiplayer backend for Prototown.
--
-- The engine is a pure deterministic reducer, so the server never runs game
-- logic: a game is its config (seed, tribes, ...) plus an append-only action
-- log. Every client replays the log to reach the identical state. All writes
-- go through SECURITY DEFINER functions that check the caller's secret seat
-- token, whose turn it is, and an optimistic action index; the tables
-- themselves accept no direct writes from the anon role.

create table games (
  id           uuid primary key default gen_random_uuid(),
  status       text not null default 'active' check (status in ('active', 'finished')),
  -- {v, engine, seed, size, winMode, difficulty, tribes, humanSeats}
  config       jsonb not null,
  current_seat int  not null default 0,
  action_count int  not null default 0,
  winner_seat  int,
  -- serialized state at snapshot_idx, so clients can skip replaying the whole log
  snapshot     jsonb,
  snapshot_idx int  not null default 0,
  -- human seats handed to the AI after abandoning their turn; on the games row
  -- (not seats) so clients can read it and know who they must drive
  takeover_seats int[] not null default '{}',
  -- rematch pointer, set once by create_rematch
  next_game_id uuid,
  created_at   timestamptz not null default now(),
  -- time of the last action; drives the abandoned-turn AI takeover
  updated_at   timestamptz not null default now()
);

create table seats (
  game_id           uuid not null references games(id) on delete cascade,
  seat_no           int  not null,
  -- the secret in each player's personal link; never readable through the API
  token             uuid not null default gen_random_uuid(),
  is_ai             boolean not null default false,
  push_subscription jsonb,
  last_seen         timestamptz,
  primary key (game_id, seat_no)
);

create table actions (
  game_id    uuid not null references games(id) on delete cascade,
  idx        int  not null,
  seat_no    int  not null,
  action     jsonb not null,
  created_at timestamptz not null default now(),
  primary key (game_id, idx)
);

alter table games   enable row level security;
alter table seats   enable row level security;
alter table actions enable row level security;

-- Games and their logs are readable by anyone holding the unguessable game id
-- (Realtime postgres_changes needs a plain SELECT policy). The seats table has
-- no policy at all: tokens and push endpoints stay server-side only.
create policy games_read   on games   for select to anon, authenticated using (true);
create policy actions_read on actions for select to anon, authenticated using (true);

alter publication supabase_realtime add table actions;
alter publication supabase_realtime add table games;

-- Config for the push pipeline (edge function url + shared secret), kept out
-- of the API-exposed schema.
create schema if not exists app_private;
create table app_private.config (key text primary key, value text not null);

-- ---------------------------------------------------------------------------

create or replace function create_game(p_config jsonb, p_human_seats int, p_total_seats int)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_game_id uuid;
  v_seats jsonb;
begin
  if p_human_seats < 1 or p_human_seats > 2
     or p_total_seats < 2 or p_total_seats > 4
     or p_human_seats > p_total_seats then
    raise exception 'bad_seats';
  end if;
  insert into games (config) values (p_config) returning id into v_game_id;
  insert into seats (game_id, seat_no, is_ai)
    select v_game_id, s, s >= p_human_seats
    from generate_series(0, p_total_seats - 1) s;
  select jsonb_agg(jsonb_build_object('seat_no', seat_no, 'token', token) order by seat_no)
    into v_seats
    from seats where game_id = v_game_id and not is_ai;
  return jsonb_build_object('game_id', v_game_id, 'seats', v_seats);
end;
$$;

-- The one write path for moves. The caller must hold a human seat's token and
-- either it is their turn, or the current seat is AI-driven (any member may
-- advance the AI — the agent is deterministic, so racing clients submit the
-- same action and the idx check picks one winner).
create or replace function submit_action(
  p_game_id uuid,
  p_token uuid,
  p_expected_idx int,
  p_action jsonb,
  p_next_seat int,
  p_winner_seat int default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_game games%rowtype;
  v_seat seats%rowtype;
  v_current seats%rowtype;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found then raise exception 'bad_token'; end if;
  select * into v_seat from seats
    where game_id = p_game_id and token = p_token and not is_ai;
  if not found then raise exception 'bad_token'; end if;
  if v_game.status <> 'active' then raise exception 'finished'; end if;
  if v_game.action_count <> p_expected_idx then raise exception 'conflict'; end if;
  select * into v_current from seats
    where game_id = p_game_id and seat_no = v_game.current_seat;
  if v_game.current_seat <> v_seat.seat_no
     and not (v_current.is_ai or v_game.current_seat = any (v_game.takeover_seats)) then
    raise exception 'not_your_turn';
  end if;
  if not exists (select 1 from seats where game_id = p_game_id and seat_no = p_next_seat) then
    raise exception 'bad_seats';
  end if;

  insert into actions (game_id, idx, seat_no, action)
    values (p_game_id, v_game.action_count, v_game.current_seat, p_action);
  update games set
    action_count = action_count + 1,
    current_seat = p_next_seat,
    winner_seat  = p_winner_seat,
    status       = case when p_winner_seat is null then status else 'finished' end,
    updated_at   = now()
  where id = p_game_id;
  update seats set last_seen = now()
    where game_id = p_game_id and seat_no = v_seat.seat_no;
  return jsonb_build_object('idx', v_game.action_count);
end;
$$;

create or replace function whoami(p_game_id uuid, p_token uuid)
returns int
language sql security definer set search_path = public
as $$
  select seat_no from seats
  where game_id = p_game_id and token = p_token and not is_ai;
$$;

-- Cache of the replayed state so a fresh load doesn't replay thousands of
-- actions. Only accepted when it describes the log's current tip.
create or replace function save_snapshot(p_game_id uuid, p_token uuid, p_idx int, p_snapshot jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_game games%rowtype;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found then raise exception 'bad_token'; end if;
  if not exists (select 1 from seats where game_id = p_game_id and token = p_token and not is_ai) then
    raise exception 'bad_token';
  end if;
  if p_idx = v_game.action_count and p_idx > v_game.snapshot_idx then
    update games set snapshot = p_snapshot, snapshot_idx = p_idx where id = p_game_id;
  end if;
end;
$$;

-- After 24 hours of silence on the current player's turn, the waiting player
-- may hand the absent seat to the AI so the game can finish. The threshold is
-- enforced here, not in the UI.
create or replace function claim_ai_takeover(p_game_id uuid, p_token uuid, p_target_seat int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_game games%rowtype;
  v_caller seats%rowtype;
  v_target seats%rowtype;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found then raise exception 'bad_token'; end if;
  select * into v_caller from seats
    where game_id = p_game_id and token = p_token and not is_ai;
  if not found then raise exception 'bad_token'; end if;
  if v_game.status <> 'active' then raise exception 'finished'; end if;
  select * into v_target from seats
    where game_id = p_game_id and seat_no = p_target_seat;
  if not found or v_target.is_ai
     or p_target_seat = any (v_game.takeover_seats)
     or v_target.seat_no = v_caller.seat_no then
    raise exception 'bad_seats';
  end if;
  if v_game.current_seat <> p_target_seat then raise exception 'not_your_turn'; end if;
  if v_game.updated_at > now() - interval '24 hours' then raise exception 'too_soon'; end if;
  -- on the games row so every client hears about it (games is in the realtime
  -- publication and anon-readable; seats is neither)
  update games set
    takeover_seats = array_append(takeover_seats, p_target_seat),
    updated_at = now()
  where id = p_game_id;
end;
$$;

create or replace function save_push_subscription(p_game_id uuid, p_token uuid, p_subscription jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_seat seats%rowtype;
begin
  select * into v_seat from seats
    where game_id = p_game_id and token = p_token and not is_ai;
  if not found then raise exception 'bad_token'; end if;
  update seats set push_subscription = p_subscription, last_seen = now()
    where game_id = p_game_id and seat_no = v_seat.seat_no;
end;
$$;

-- Same opponents, same tokens, fresh map. Idempotent: the second caller (or a
-- repeat click) gets the game the first caller created.
create or replace function create_rematch(p_game_id uuid, p_token uuid, p_config jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_game games%rowtype;
  v_new_id uuid;
begin
  select * into v_game from games where id = p_game_id for update;
  if not found then raise exception 'bad_token'; end if;
  if not exists (select 1 from seats where game_id = p_game_id and token = p_token and not is_ai) then
    raise exception 'bad_token';
  end if;
  if v_game.status <> 'finished' then raise exception 'not_your_turn'; end if;
  if v_game.next_game_id is not null then return v_game.next_game_id; end if;

  insert into games (config) values (p_config) returning id into v_new_id;
  insert into seats (game_id, seat_no, token, is_ai)
    select v_new_id, seat_no, token, is_ai
    from seats where game_id = p_game_id;
  update games set next_game_id = v_new_id, updated_at = now() where id = p_game_id;
  return v_new_id;
end;
$$;
