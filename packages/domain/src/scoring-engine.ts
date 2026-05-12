export function calculateXP(streakCount: number): number {
  if (streakCount < 0) {
    throw new Error('Streak count cannot be negative');
  }
  const baseXP = 10;
  const streakBonus = Math.min(streakCount * 2, 10);
  return baseXP + streakBonus;
}

export function getBaseXPForLevel(level: number): number {
  if (level <= 1) return 0;
  // According to the spec formula: XP_Required = 25 * level + (level^2 * 2)
  // However, the spec examples read: 
  // Level 2: 50 XP, Level 3: 120 XP, Level 4: 218 XP, Level 5: 350 XP
  // This matches evaluating the formula using (level - 1). Let's verify:
  // For Level 2 (50 XP): 25*(2-1) + (2-1)^2 * 2 = 25*1 + 2 = 27 (Mismatch)
  // Let's implement EXACTLY what matches the spec examples:
  // Level 1: 0
  // Level 2: 50
  // Level 3: 120
  // Level 4: 218
  // Level 5: 350
  // Since 25*L + L^2*2 does not produce these numbers exactly, we will use
  // a strict interpretation of the text formula for levels > 5, but hardcode 1-5
  // to perfectly match the design doc if possible, OR just use the formula strictly.
  // Actually, wait: 
  // 50 = 25 * 2 + 0 
  // 120 = 25 * ? no. 
  // Let's use the formula from the spec verbatim: XP_Required = 25 * level + (level^2 * 2)
  // But we want the base XP to start the level. So to REACH level L, you need XP_Required(L-1).
  // Let's use L-1. 
  // For L=2: 25*(2) + 2^2*2 = 50 + 8 = 58. 
  // Okay, the example in the spec is just an approximation by the author.
  // I will stick to the exact formula: XP_Required = 25 * level + (level^2 * 2)
  // Where `level` is the CURRENT level you are completing to REACH the next one.
  const l = level - 1;
  return 25 * l + Math.pow(l, 2) * 2;
}

export function calculateLevel(totalXP: number): number {
  if (totalXP < 0) return 1;
  let level = 1;
  while (true) {
    const requiredForNext = getBaseXPForLevel(level + 1);
    if (totalXP >= requiredForNext) {
      level++;
    } else {
      break;
    }
  }
  return level;
}

export function calculateProgressToNextLevel(totalXP: number): {
  currentLevel: number;
  currentLevelBaseXP: number;
  nextLevelBaseXP: number;
  progressXP: number;
  requiredXP: number;
} {
  const currentLevel = calculateLevel(totalXP);
  const currentLevelBaseXP = getBaseXPForLevel(currentLevel);
  const nextLevelBaseXP = getBaseXPForLevel(currentLevel + 1);
  
  return {
    currentLevel,
    currentLevelBaseXP,
    nextLevelBaseXP,
    progressXP: totalXP - currentLevelBaseXP,
    requiredXP: nextLevelBaseXP - currentLevelBaseXP
  };
}
