import { state } from './state.js';

// ═══════════════════════════════════════════
// DIFFICULTY PRESETS
// ═══════════════════════════════════════════

export const DIFFICULTIES = {
  CADET: {
    label: 'CADET',
    desc: 'Training mode. All contacts auto-identified. No civilian traffic. Fewer incidents.',
    autoId: true,
    civilians: false,
    incidentFilter: 'EASY',
    armSpawnChance: 0,
    awacsHuntChance: 0,
    scoreMultiplier: 0.5,
  },
  STANDARD: {
    label: 'STANDARD',
    desc: 'Full watch station. IFF required. Civilian traffic active. Standard pacing.',
    autoId: false,
    civilians: true,
    incidentFilter: 'STANDARD',
    armSpawnChance: 0.35,
    awacsHuntChance: 0.4,
    scoreMultiplier: 1.0,
  },
  VETERAN: {
    label: 'VETERAN',
    desc: 'Heightened alert. More attacks, tighter windows. Enhanced SEAD. Full IFF.',
    autoId: false,
    civilians: true,
    incidentFilter: 'HARD',
    armSpawnChance: 0.55,
    awacsHuntChance: 0.6,
    scoreMultiplier: 1.5,
  },
};

export function getDifficulty() {
  return DIFFICULTIES[state.difficulty] || DIFFICULTIES.STANDARD;
}
