export default function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="max-h-[85vh] w-[min(560px,94vw)] overflow-auto rounded-xl border border-white/15 bg-[#0f1828] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">How to play</h2>
          <button className="rounded bg-white/10 px-3 py-1 hover:bg-white/20" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="space-y-3 text-sm text-white/80">
          <p>
            <b>Goal:</b> in <i>Domination</i>, be the last tribe with a city. In <i>Perfection</i>, have the
            highest score after 30 turns.
          </p>
          <List
            title="Controls"
            items={[
              "Tap or click a unit to select it — white tiles are moves, red rings are attack targets.",
              "Tap a highlighted tile or enemy to move or attack.",
              "Drag to pan; pinch or scroll to zoom. Use the corner buttons to zoom or fit the whole map.",
              "Click your city to train units; click resource tiles in your borders to harvest or build.",
            ]}
          />
          <List
            title="Keyboard"
            items={[
              "Tab — jump to the next unit that can still act.",
              "Space — end your turn.",
              "Esc — deselect. + and − zoom, F fits the map to the screen.",
            ]}
          />
          <List
            title="Your tribe"
            items={[
              "Ashfen (Forgefire) — attacks deal 25% more damage.",
              "Korvani (Tidebound) — boats move one tile further.",
              "Meridia (Suntithe) — one extra star every turn.",
              "Thornwood (Surefoot) — crosses mountains without Climbing.",
            ]}
          />
          <List
            title="Economy"
            items={[
              "Cities pay stars every turn — higher level pays more; capitals and workshops pay extra. Trade adds one more per city.",
              "Harvest fruit, animals, and fish (needs the matching tech) to grow city population.",
              "Whales are the exception: with Whaling they pay stars rather than population.",
              "Farms, mines, lumber huts, and ports grow population faster.",
              "Ports are the only way to put to sea — with Sailing they launch ships instead of rafts.",
              "When population fills the bar, the city levels up and you pick a reward.",
              "Construction and Spiritualism let you simply buy City Walls and Grand Parks instead of waiting to be offered them.",
            ]}
          />
          <List
            title="War"
            items={[
              "Move a unit onto a village, then Capture it next turn to gain a city.",
              "Capture enemy cities the same way — take them all to win by Domination.",
              "Defenders in forests, mountains, or behind walls take much less damage.",
              "Units that survive 3 kills become veterans with extra health.",
              "With Roads, units move twice as far inside your own borders — and woods and peaks there no longer halt them.",
              "Strategy lets every city support one more unit.",
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1 font-bold text-white">{title}</div>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}
