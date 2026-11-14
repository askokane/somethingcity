export const UNITS_PER_METER = 3 / 7;
export const FLOOR = 3 * UNITS_PER_METER;
export const GRID_SIZE = 9;
export const BLOCK_SPACING = 12;
export const LAND_SIZE = GRID_SIZE * BLOCK_SPACING;
export const CHANNEL_WIDTH = 18;
export const ISLAND_OFFSET = 24;
const landmarkSpecs = [
  ['Wayne Tower', 'wayne_tower.glb', 0, 12],
  ['Ace Chemicals', 'ace_chemicals_8bit.glb', 8, 6],
  ['Arkham Asylum', 'arkham_asylum_8bit.glb', 2, 7],
  ['Gotham Bank', 'gotham_bank.glb', 6, 6],
  ['GCPD Headquarters', 'gcpd_hq.glb', 27, 5],
  ['Cobblepot Manor', 'cobblepot_manor.glb', 35, 5],
  ['Blackgate Penitentiary', 'blackgate_penitentiary.glb', 72, 4],
  ['Elliot Memorial', 'elliot_memorial.glb', 80, 5],
];
const cutouts = new Set([3, 12, 36, 54, 63, 66, 75, 4, 5, 13, 26, 62, 71, 76, 77]);
const cell = (row, col, sourceId) => ({
  sourceId, row, col,
  x: (col - 4) * 12 + (col < 4 ? -9 : 9),
  z: (row - 4) * 12 + (col < 4 ? 0 : ISLAND_OFFSET),
  island: col < 4 ? 'West Island' : 'East Island',
  district: row < 0 ? 'North Head' : ['Northpoint', 'Old Gotham', 'Crown Point', 'The Foundry'][(row + col + 20) % 4],
});
export const landCells = Array.from({ length: 81 }, (_, i) => cell(Math.floor(i / 9), i % 9, i)).filter(c => !cutouts.has(c.sourceId));
// The northern peninsula extends the upper island toward the back/top corner.
for (const [row, columns] of [[-1, [-1, 0, 1, 2]], [-2, [-2, -1, 0, 1, 2]], [-3, [-2, -1, 0, 1]], [-4, [-1, 0]], [0, [-1]], [1, [-1]], [2, [-1]]]) {
  for (const col of columns) landCells.push(cell(row, col, `north-${row}-${col}`));
}

export const islands = ['West Island', 'East Island'].map(name => {
  const cells = landCells.filter(c => c.island === name);
  const minX = Math.min(...cells.map(c => c.x - 6)), maxX = Math.max(...cells.map(c => c.x + 6));
  const minZ = Math.min(...cells.map(c => c.z - 6)), maxZ = Math.max(...cells.map(c => c.z + 6));
  return { name, cells, minX, maxX, minZ, maxZ, z: (minZ + maxZ) / 2 };
});
const minX = Math.min(...islands.map(i => i.minX)), maxX = Math.max(...islands.map(i => i.maxX));
const minZ = Math.min(...islands.map(i => i.minZ)), maxZ = Math.max(...islands.map(i => i.maxZ));
export const CITY_SIZE = Math.max(maxX - minX, maxZ - minZ);
export const CITY_CENTER_X = (minX + maxX) / 2;
export const CITY_CENTER_Z = (minZ + maxZ) / 2;
export const bridge = { x: -6, z: 6, length: 20, width: 3 };

export const blocks = landCells.map((c, i) => ({ ...c, cells: [c], width: 9, depth: 9, format: i % 11 === 5 ? 'terrace' : i % 13 === 7 ? 'courtyard' : 'standard' }));
blocks.forEach(b => { if (b.format === 'terrace') b.width = 6.5; if (b.format === 'courtyard') b.depth = 6.5; });
function merge(ids, format, district) {
  const members = ids.map(id => blocks.find(b => b.sourceId === id));
  if (members.some(b => !b)) throw new Error('Missing superblock member');
  const keep = members[0];
  keep.cells = members.flatMap(b => b.cells);
  keep.x = members.reduce((sum, b) => sum + b.x, 0) / members.length;
  keep.width = 21; keep.format = format; keep.district = district;
  members.slice(1).forEach(b => blocks.splice(blocks.indexOf(b), 1));
}
merge([28, 29], 'garden', 'Gotham Commons');
merge([51, 52], 'market', 'Harbor Market');
merge(['north--4--1', 'north--4-0'], 'garden', 'North Head Lookout');
for (const [id, format, district] of [[18, 'plaza', 'Founders Square'], [44, 'dockyard', 'East Quay']]) {
  const b = blocks.find(block => block.sourceId === id);
  b.format = format; b.district = district;
}

export const landmarks = landmarkSpecs.map(([name, file, sourceId, height]) => {
  const block = blocks.findIndex(b => b.sourceId === sourceId);
  if (block < 0) throw new Error(`Missing landmark block: ${name}`);
  blocks[block].format = 'landmark';
  blocks[block].width = blocks[block].depth = 9;
  return { name, file, block, height };
});
export const slots = blocks.flatMap((b, block) => {
  const offsets = ['landmark','garden','plaza','dockyard'].includes(b.format) ? []
    : b.format === 'market' ? [[-7.5, 0], [-2.5, 0], [2.5, 0], [7.5, 0]]
    : b.format === 'terrace' ? [[0, -2.25], [0, 2.25]]
    : b.format === 'courtyard' ? [[-2.25, 0], [2.25, 0]]
    : [[-2.25, -2.25], [2.25, -2.25], [-2.25, 2.25], [2.25, 2.25]];
  return offsets.map(([dx, dz]) => ({ x: b.x + dx, z: b.z + dz, district: `${b.district} / ${b.island}`, block }));
});
slots.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));

export function isOnLand(x, z, margin = 0) {
  return landCells.some(c => Math.abs(x - c.x) <= 6 - margin && Math.abs(z - c.z) <= 6 - margin);
}

// Shared roads are emitted once; only unshared edges receive a seawall.
export const edges = [];
const owner = new Map();
blocks.forEach((b, index) => b.cells.forEach(c => owner.set(`${c.x},${c.z}`, index)));
const land = new Set(landCells.map(c => `${c.x},${c.z}`));
for (const c of landCells) for (const [dx, dz] of [[12, 0], [-12, 0], [0, 12], [0, -12]]) {
  const next = `${c.x + dx},${c.z + dz}`;
  const shore = !land.has(next);
  if (!shore && owner.get(next) === owner.get(`${c.x},${c.z}`)) continue;
  if (!shore && (dx < 0 || dz < 0)) continue;
  edges.push({ x: c.x + dx / 2, z: c.z + dz / 2, vertical: dx !== 0, shore });
}
