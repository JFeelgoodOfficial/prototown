import { useGame } from "../ui/store";
import MainMenu from "../ui/MainMenu";
import GameScreen from "../ui/GameScreen";
import GameOverScreen from "../ui/GameOverScreen";

export default function App() {
  const game = useGame();
  if (game.screen === "game" && game.state) return <GameScreen />;
  if (game.screen === "gameover" && game.state) return <GameOverScreen />;
  return <MainMenu />;
}
