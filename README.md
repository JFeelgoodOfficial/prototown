# Polyforge

A single-player 4X strategy game in the spirit of The Battle of Polytopia,
built to play in the browser — you against 1–3 AI tribes. No multiplayer,
no accounts, no server: the whole game runs client-side and autosaves to
your browser.

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
level them up, research the 25-tech tree, and out-fight the AI.

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

## Development

```
npm test        # engine test suite (combat, economy, mapgen, AI self-play)
npm run build   # type-check + production build
```

All art is drawn procedurally in code; there are no third-party game
assets. Tribe names, city names, and visuals are original.
