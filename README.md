# Polyforge

A 4X strategy game in the spirit of The Battle of Polytopia, built to play
in the browser — solo against 1–3 AI tribes, or online against a friend.
Single-player runs entirely client-side with no accounts or server, and
autosaves to your browser.

**Online multiplayer** is async, Polytopia-mobile style: create a game,
send your friend their secret link, and take turns whenever suits you —
iPhone, Android, or desktop, no sign-up. When you're both online it updates
live; add the game to your home screen and you can get a push notification
when it's your turn. Games can include up to two AI rivals, and if your
opponent disappears for a day you can hand their tribe to the AI. Backed by
a free Supabase project — see [supabase/README.md](supabase/README.md) for
the one-time setup (skipping it simply hides the "Play online" button).

## Play

```
npm install
npm run dev
```

Open the printed URL, pick a tribe, and start a game.

- **Domination** — capture every rival city to be the last tribe standing.
- **Perfection** — score the most points in 30 turns.

Click units to select, click highlighted tiles to move, click ringed
enemies to attack. Capture villages to found cities, harvest resources to
level them up, research the tech tree, and out-fight the AI.

Later on the map opens up: mine any peak you hold and plough any field you
have already picked clean; raise Naval Towers that shell passing shipping,
Airfields whose scouts and bombers fly over everything, and Flak Towers that
answer them; build Hospitals that mend your soldiers where they stand, and
Medics who carry that care into the field. With a hundred stars saved, a unit
on unclaimed ground can found a town of its own.

## How it works

- `src/engine/` — pure, deterministic game engine: `GameState` +
  `computeLegalActions` + `applyAction`. Seeded RNG lives in the state, so
  games replay identically. Mechanics (combat formula, unit stats, tech
  tree, city leveling) follow the open-source
  [Tribes](https://github.com/GAIGResearch/Tribes) research implementation.
- `src/ai/` — greedy heuristic agent that plays through the same
  legal-action API as the human, under the same fog of war.
- `src/render/` — Canvas 2D isometric renderer with procedural art.
- `src/ui/` — React components for menus, panels, and dialogs.
- `src/net/` — online play. Because the engine is deterministic, a game is
  just its config plus an append-only action log in Postgres; every client
  replays the log to the identical state, and whoever is online advances
  the AI seats. `@supabase/supabase-js` is lazy-loaded, so single-player
  ships none of it.

## Development

```
npm test        # engine test suite (combat, economy, mapgen, AI self-play)
npm run build   # type-check + production build
```

All art is drawn procedurally in code; there are no third-party game
assets. Tribe names, city names, and visuals are original.
