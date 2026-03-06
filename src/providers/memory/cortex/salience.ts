/**
 * memU's salience scoring formula.
 *
 * salience = similarity * log(reinforcementCount + 1) * recencyFactor
 *
 * Where recencyFactor = exp(-0.693 * daysSinceLastReinforced / recencyDecayDays)
 * 0.693 = ln(2), giving proper half-life decay.
 */
export function salienceScore(params: {
  similarity: number;
  reinforcementCount: number;
  lastReinforcedAt: string | null;
  recencyDecayDays: number;
}): number {
  const { similarity, reinforcementCount, lastReinforcedAt, recencyDecayDays } = params;

  // Reinforcement factor: logarithmic to prevent runaway scores
  const reinforcementFactor = Math.log(reinforcementCount + 1);

  // Recency factor: exponential decay with half-life
  let recencyFactor: number;
  if (lastReinforcedAt === null) {
    recencyFactor = 0.5; // Unknown recency gets neutral score
  } else {
    const daysAgo = (Date.now() - new Date(lastReinforcedAt).getTime()) / 86_400_000;
    recencyFactor = Math.exp(-0.693 * daysAgo / recencyDecayDays);
  }

  return similarity * reinforcementFactor * recencyFactor;
}
