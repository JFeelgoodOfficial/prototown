// Sends "your turn" / "game over" Web Push notifications.
//
// Invoked by the games_notify_turn database trigger (see
// supabase/migrations/0002_push.sql) with a shared-secret header; deploy with
// --no-verify-jwt since callers aren't Supabase users:
//
//   supabase functions deploy turn-push --no-verify-jwt
//
// Secrets (supabase secrets set KEY=VALUE):
//   VAPID_KEYS    JSON from generate-vapid-keys.ts
//   PUSH_CONTACT  mailto:you@example.com (sent to the push services)
//   PUSH_SECRET   must match app_private.config 'push_secret'
//   APP_URL       where the game is hosted, e.g. https://prototown.example.com

import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

interface Payload {
  game_id: string;
  seat_nos: number[];
  finished: boolean;
  winner_seat: number | null;
  action_count: number;
}

const appServerPromise = (async () => {
  const vapidKeys = await webpush.importVapidKeys(JSON.parse(Deno.env.get("VAPID_KEYS") ?? ""), {
    extractable: false,
  });
  return webpush.ApplicationServer.new({
    contactInformation: Deno.env.get("PUSH_CONTACT") ?? "mailto:admin@example.com",
    vapidKeys,
  });
})();

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("nope", { status: 405 });
  if (req.headers.get("x-push-secret") !== Deno.env.get("PUSH_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  const body = (await req.json()) as Payload;
  if (!body?.game_id || !Array.isArray(body.seat_nos) || body.seat_nos.length === 0) {
    return new Response("bad request", { status: 400 });
  }

  // service role: seats (tokens + subscriptions) is invisible to the anon API
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: seats, error } = await supabase
    .from("seats")
    .select("seat_no, token, push_subscription")
    .eq("game_id", body.game_id)
    .in("seat_no", body.seat_nos)
    .not("push_subscription", "is", null);
  if (error) return new Response(error.message, { status: 500 });

  const appServer = await appServerPromise;
  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  let sent = 0;

  for (const seat of seats ?? []) {
    const message = body.finished
      ? {
          title: "Prototown — game over",
          body: body.winner_seat === seat.seat_no ? "You won! See the final map." : "The game has ended. See who won.",
        }
      : { title: "Prototown — your turn!", body: `Move ${body.action_count}. The tribes await your orders.` };
    const payload = {
      ...message,
      url: `${appUrl}/#g/${body.game_id}/${seat.seat_no}/${seat.token}`,
    };
    try {
      const subscriber = appServer.subscribe(seat.push_subscription as webpush.PushSubscription);
      await subscriber.pushTextMessage(JSON.stringify(payload), { ttl: 24 * 3600 });
      sent++;
    } catch (err) {
      // 404/410 means the browser dropped the subscription — forget it
      if (err instanceof webpush.PushMessageError && (err.response.status === 404 || err.response.status === 410)) {
        await supabase
          .from("seats")
          .update({ push_subscription: null })
          .eq("game_id", body.game_id)
          .eq("seat_no", seat.seat_no);
      } else {
        console.error(`push to seat ${seat.seat_no} failed:`, err);
      }
    }
  }
  return Response.json({ sent });
});
