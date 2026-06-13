export const AGENT_COUNT = 2000;
export const ROWS = 40;
export const COLS = 50;

/** Slow ~2.5s beats, flat 2D grid — full grid from start, random verdicts */
export const CINEMA_TIMING = {
  introMs: 2500,
  reviewHoldMs: 2500,
  verdictWaveMs: 8000,
  tallyHoldMs: 2500,
  verdictGlowMs: 1400,
  ratioLockBeforeVerdictMs: 500,
  verdictJitterMs: 1200,
} as const;

export function cinemaMinDurationMs() {
  const t = CINEMA_TIMING;
  return t.introMs + t.reviewHoldMs + t.verdictWaveMs + t.tallyHoldMs;
}

export function cinemaVerdictStartMs() {
  const t = CINEMA_TIMING;
  return t.introMs + t.reviewHoldMs;
}

export interface CinemaSeat {
  id: number;
  row: number;
  col: number;
  x: number;
  y: number;
  size: number;
  spawnAt: number;
  verdictAt: number;
  finalVerdict: "green" | "red";
  glow: number;
}

export interface CinemaLayout {
  seats: CinemaSeat[];
  screen: { x: number; y: number; w: number; h: number };
  grid: { x: number; y: number; w: number; h: number };
}

function hash(n: number): number {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function shuffledIndices(count: number, seed: number): number[] {
  const indices = Array.from({ length: count }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(hash(seed + i) * (i + 1));
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }
  return indices;
}

/** Flat 2D auditorium — uniform grid, task bar on top */
export function buildCinemaLayout(width: number, height: number): CinemaLayout {
  const seats: CinemaSeat[] = [];
  const padX = width * 0.03;
  const screenH = height * 0.13;
  const screen = {
    x: padX,
    y: height * 0.04,
    w: width - padX * 2,
    h: screenH,
  };

  const grid = {
    x: padX,
    y: screen.y + screen.h + height * 0.04,
    w: width - padX * 2,
    h: height - (screen.y + screen.h + height * 0.06) - height * 0.04,
  };

  const cellW = grid.w / COLS;
  const cellH = grid.h / ROWS;
  const seatSize = Math.min(cellW, cellH) * 0.52;
  const verdictStart = cinemaVerdictStartMs();
  const verdictOrder = shuffledIndices(ROWS * COLS, 17);

  let id = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = grid.x + col * cellW + cellW / 2;
      const y = grid.y + row * cellH + cellH / 2;

      const orderT = verdictOrder[id]! / Math.max(ROWS * COLS - 1, 1);

      seats.push({
        id: id,
        row,
        col,
        x,
        y,
        size: seatSize,
        spawnAt: 0,
        verdictAt:
          verdictStart +
          orderT * CINEMA_TIMING.verdictWaveMs +
          hash(id + 77) * CINEMA_TIMING.verdictJitterMs,
        finalVerdict: "green",
        glow: 0,
      });
      id++;
    }
  }

  return { seats, screen, grid };
}

export function assignVerdicts(seats: CinemaSeat[], greenRatio: number, seed = 42) {
  const greenTarget = Math.round(seats.length * greenRatio);
  const indices = seats.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(hash(seed + i) * (i + 1));
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }
  const greenSet = new Set(indices.slice(0, greenTarget));
  for (const seat of seats) {
    seat.finalVerdict = greenSet.has(seat.id) ? "green" : "red";
  }
}

export function deriveGreenRatioFromWinner(
  winnerLabel: string | undefined,
  variants: Array<{ label: string }>,
): number {
  if (!winnerLabel || variants.length < 2) return 0.68;
  const idx = variants.findIndex((v) => v.label === winnerLabel);
  if (idx === 0) return 0.72;
  if (idx === 1) return 0.61;
  return 0.54;
}

export function cinemaPhaseLabel(elapsed: number, _spawned: number, verdictCount: number): string {
  const t = CINEMA_TIMING;
  const verdictStart = cinemaVerdictStartMs();

  if (elapsed < t.introMs) return "Preparing the grid…";
  if (elapsed < verdictStart) return "2,000 agents reviewing your task…";
  if (verdictCount < AGENT_COUNT * 0.12) return "Verdicts incoming…";
  if (verdictCount < AGENT_COUNT * 0.85) return "Judgment rippling across the grid…";
  return "Tallying the network…";
}
