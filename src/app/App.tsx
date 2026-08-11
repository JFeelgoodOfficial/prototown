import { useGame } from "../ui/store";
import TitleScreen from "../ui/TitleScreen";
import GameScreen from "../ui/GameScreen";
import GameOverScreen from "../ui/GameOverScreen";
import OrientationGate from "../ui/OrientationGate";

export default function App() {
  const game = useGame();
  return (
    <OrientationGate>
      {game.screen === "game" && game.state ? (
        <GameScreen />
      ) : game.screen === "gameover" && game.state ? (
        <GameOverScreen />
      ) : (
        <TitleScreen />
      )}
    </OrientationGate>
  );
}
