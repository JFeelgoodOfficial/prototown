# Online multiplayer backend

Async two-player games run on a free [Supabase](https://supabase.com)
project. The server stores no game logic — just each game's config and an
append-only action log that every client replays through the deterministic
engine. Writes go through `SECURITY DEFINER` SQL functions that check a
per-seat secret token, turn order, and an optimistic action index.

## One-time setup

1. **Create a project** at [database.new](https://database.new) (free tier).

2. **Apply the schema** with the [Supabase CLI](https://supabase.com/docs/guides/local-development):

   ```sh
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push        # runs supabase/migrations/*.sql
   ```

3. **Build the web app** with the project's URL and anon key (Project
   Settings → API), e.g. in `.env.local` or your host's env settings:

   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

   Without these the app still builds — the "Play online" button just
   doesn't appear. Deploy `dist/` to any static host (Vercel, Netlify,
   GitHub Pages). HTTPS is required for the service worker and push.

That's enough to play online. Push notifications are optional and add:

4. **Generate VAPID keys**:

   ```sh
   deno run supabase/functions/generate-vapid-keys.ts
   ```

   Put the public key in the web build env as `VITE_VAPID_PUBLIC_KEY`
   (rebuild/redeploy), and keep the JSON for the next step.

5. **Deploy the push function** with its secrets:

   ```sh
   supabase secrets set \
     VAPID_KEYS='<json from step 4>' \
     PUSH_CONTACT='mailto:you@example.com' \
     PUSH_SECRET="$(openssl rand -hex 24)" \
     APP_URL='https://your-game-host.example.com'
   supabase functions deploy turn-push --no-verify-jwt
   ```

6. **Point the database at the function** (SQL editor):

   ```sql
   insert into app_private.config (key, value) values
     ('push_fn_url', 'https://<ref>.supabase.co/functions/v1/turn-push'),
     ('push_secret', '<same value as PUSH_SECRET>');
   ```

## Local development

```sh
supabase start          # local stack in Docker
supabase db reset       # apply migrations
```

Put the printed local URL + anon key in `.env.local`, run `npm run dev`,
and open the two seat links in two browser profiles. To test push locally:

```sh
supabase functions serve turn-push --no-verify-jwt
```

and set `push_fn_url` to `http://host.docker.internal:54321/functions/v1/turn-push`
so the database container can reach it.

## Good to know

- **Free-tier pause**: Supabase pauses free projects after about a week
  with no API traffic, which makes every open game unreachable until you
  restore it from the dashboard. Any turn taken counts as traffic; for
  insurance, a weekly scheduled ping (e.g. a GitHub Actions cron hitting
  `https://<ref>.supabase.co/rest/v1/` with the anon key) keeps it awake.
- **Privacy model**: game ids are unguessable UUIDs and move logs are
  readable to anyone who has one; seat tokens and push subscriptions are
  never readable through the API. Anyone holding a seat link can play that
  seat — treat links like tickets.
- **Engine version**: games record the engine's `SAVE_VERSION` at creation
  and clients on a different version refuse to open them (replaying a log
  through changed rules would silently diverge). Bump `SAVE_VERSION`
  whenever reducer behavior changes.
- **Cleanup**: a `pg_cron` job deletes games untouched for 60 days.
