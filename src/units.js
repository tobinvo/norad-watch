// ═══════════════════════════════════════════
// UNIT CONVERSION
// Internal: knots (nm/hr). Display: MPH.
// ═══════════════════════════════════════════

const KTS_TO_MPH = 1.15078;

export function ktsToMph(knots) {
  return Math.round(knots * KTS_TO_MPH);
}
