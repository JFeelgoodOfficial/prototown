import { useEffect, useState } from "react";
import { useGame } from "../ui/store";
import TitleScreen from "../ui/TitleScreen";
import GameScreen from "../ui/GameScreen";
import GameOverScreen from "../ui/GameOverScreen";
import OrientationGate from "../ui/OrientationGate";
import OnlineGameLoader from "../ui/OnlineGameLoader";
import { parseGameHash, type SeatRef } from "../net/types";

export default function App() {
  const game = useGame();
  // A seat link in the URL (#g/<game>/<seat>/<token>) routes into that online
  // game; everything else follows the controller's screen as before.
  const [seatRef, setSeatRef] = useState<SeatRef | null>(() => parseGameHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setSeatRef(parseGameHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    // leaving a game link (back button, "Back to title") closes the session
    if (!seatRef && game.mode === "online") game.leaveOnline();
  }, [seatRef, game]);
  return (
    <OrientationGate>
      {seatRef ? (
        <OnlineGameLoader seatRef={seatRef} />
      ) : game.screen === "game" && game.state ? (
        <GameScreen />
      ) : game.screen === "gameover" && game.state ? (
        <GameOverScreen />
      ) : (
        <TitleScreen />
      )}
    </OrientationGate>
  );
}
