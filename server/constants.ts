// 20阶奖励值表
export const REWARDS = [
  2, 4, 6, 10, 15, 20, 30, 50, 80, 150,
  220, 300, 420, 560, 720, 900, 1100, 1350, 1650, 2000,
] as const;

export const MAX_ROLLS = 10;
export const FINAL_PRIZE = 200;
export const TOTAL_STEPS = 20;
export const DROP_COUNT = 4;
export const PLAYER_COUNT = 4;
export const PLAYER_LABELS = ["A", "B", "C", "D"] as const;

export type PlayerLabel = typeof PLAYER_LABELS[number];

export function canAct(rolls: number, locked: boolean): boolean {
  return !locked && rolls < MAX_ROLLS;
}

export function generateDropCells(): number[] {
  const candidates = Array.from({ length: 18 }, (_, i) => i + 2);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, DROP_COUNT).sort((a, b) => a - b);
}
