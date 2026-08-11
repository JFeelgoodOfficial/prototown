-- Turn notifications: when a games row hands the turn to a human with a
-- stored push subscription (or the game ends), poke the turn-push edge
-- function over pg_net. The function does the actual Web Push delivery.
--
-- Configuration lives in app_private.config:
--   push_fn_url  https://<ref>.supabase.co/functions/v1/turn-push
--   push_secret  shared secret the edge function checks (x-push-secret)
-- With no config rows present the trigger is a silent no-op, so the game
-- works fine before push is set up.

create extension if not exists pg_net;

create or replace function app_private.notify_turn()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_url text;
  v_secret text;
  v_targets int[];
begin
  if new.current_seat = old.current_seat and new.status = old.status then
    return new;
  end if;
  select value into v_url    from app_private.config where key = 'push_fn_url';
  select value into v_secret from app_private.config where key = 'push_secret';
  if v_url is null then return new; end if;

  if new.status = 'finished' and old.status <> 'finished' then
    -- game over: tell every subscribed human
    select coalesce(array_agg(seat_no), '{}') into v_targets
      from seats
      where game_id = new.id and not is_ai and push_subscription is not null;
  else
    -- turn passed: tell the human now up, unless their seat plays itself
    select coalesce(array_agg(seat_no), '{}') into v_targets
      from seats
      where game_id = new.id
        and seat_no = new.current_seat
        and not is_ai
        and not (seat_no = any (new.takeover_seats))
        and push_subscription is not null;
  end if;
  if coalesce(array_length(v_targets, 1), 0) = 0 then return new; end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'game_id', new.id,
      'seat_nos', to_jsonb(v_targets),
      'finished', new.status = 'finished',
      'winner_seat', new.winner_seat,
      'action_count', new.action_count
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', coalesce(v_secret, '')
    )
  );
  return new;
end;
$$;

create trigger games_notify_turn
  after update on games
  for each row execute function app_private.notify_turn();

-- Housekeeping: drop games nobody has touched in two months.
create extension if not exists pg_cron;
select cron.schedule(
  'prototown-cleanup',
  '17 4 * * *',
  $$delete from games where updated_at < now() - interval '60 days'$$
);
