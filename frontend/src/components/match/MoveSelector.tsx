import { Move } from "../../types";
import { moveLabels, moveShortLabels } from "../../lib/format";

interface MoveSelectorProps {
  disabled: boolean;
  selectedMove: Move | null;
  onMove: (move: Move) => void;
}

const moves: Move[] = ["rock", "paper", "scissors"];

export function MoveSelector({ disabled, selectedMove, onMove }: MoveSelectorProps) {
  return (
    <div className="move-grid" aria-label="Hamle seç">
      {moves.map((move) => (
        <button
          className={`move-button ${selectedMove === move ? "selected" : ""}`}
          disabled={disabled}
          key={move}
          onClick={() => onMove(move)}
          type="button"
          title={moveLabels[move]}
        >
          <span className="move-glyph">{moveShortLabels[move]}</span>
          <span>{moveLabels[move]}</span>
        </button>
      ))}
    </div>
  );
}
