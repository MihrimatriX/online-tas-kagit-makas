import type { ReactNode } from "react";
import { Move } from "../types";

// Drawn as objects, matching the Turkish names: a stone, a sheet, a pair of scissors.
const PATHS: Record<Move, ReactNode> = {
  rock: (
    <>
      <path d="M9 31 13 17l11-7 12 4 5 13-6 10-17 2z" />
      <path d="M13 17l8 8 15-11M21 25l3 13M21 25l20 2" />
    </>
  ),
  paper: (
    <>
      <path d="M13 7h17l7 7v27H13z" />
      <path d="M30 7v7h7M18 22h14M18 28h14M18 34h9" />
    </>
  ),
  scissors: (
    <>
      <circle cx="15" cy="35" r="5.5" />
      <circle cx="33" cy="35" r="5.5" />
      <path d="M18.8 31 34 8M29.2 31 14 8" />
      <circle cx="24" cy="23.1" r="1.3" fill="currentColor" stroke="none" />
    </>
  )
};

export function MoveIcon({ move, size = 48 }: { move: Move; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="move-icon"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.4}
      viewBox="0 0 48 48"
      width={size}
    >
      {PATHS[move]}
    </svg>
  );
}
