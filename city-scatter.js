import { slots } from './city-plan.js';

export function seededRandom(seed) {
  let value = seed >>> 0 || 1;
  return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; };
}

// Spread the first buildings across distinct blocks before filling second plots.
export function scatterSlotOrder(seed) {
  const random = seededRandom(seed);
  const shuffle = list => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const groups = new Map();
  slots.forEach((slot, index) => { if (!groups.has(slot.block)) groups.set(slot.block, []); groups.get(slot.block).push(index); });
  const blocks = shuffle([...groups.values()].map(group => shuffle(group)));
  const result = [];
  for (let round = 0; blocks.some(group => round < group.length); round++) {
    blocks.forEach(group => { if (round < group.length) result.push(group[round]); });
  }
  return result;
}

export function freshPlacementSeed() { return Math.floor(Math.random() * 4294967296); }
