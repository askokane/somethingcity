export const UNITS_PER_METER = 3 / 7;
export const FLOOR = 3 * UNITS_PER_METER;
export const BLOCK_SPACING = 12;

// The city follows the classic Gotham map. Gotham is one landmass cut by two inlets from the Gotham River on the west:
// the upper inlet (with South Channel Island) splits Uptown from Midtown, the lower and wider one (with the Narrows, Arkham's
// island) splits Midtown from Downtown; on the east, South Point/Robbinsville and Gainsly/Haysville join them up.
// North Point is notched by a cove, Reatton bulges west, Haysville bulges east, South Hinkley is a separate island to the
// south-west, and Bristol Township is the mainland across the river. North is the back of the 3D view (-z).
// One character per 12-unit cell: U Uptown, S South Channel Island, M Midtown, D Downtown, N Narrows, H South Hinkley,
// B Bristol, . water.
const GOTHAM = [
  '.........UUUU....',
  'BBB....UUUUUUUUU.',
  'BBB....UUUUUU.UU.',
  'BBB.....UUUUUUUU.',
  'BBB...........UU.',
  'BBB...SS......UUU',
  'BBB.....MMMMMMMM.',
  'BBB..MMMMMMMMMMM.',
  'BBB...MMMMMMMMMM.',
  'BBB..........DDD.',
  'BBB.......N...DDDD',
  'BBB...........DDDD',
  'BBB..DDDDDDDDDDDD',
  'BBB...DDDDDDDDDDD',
  'BBB....DDDDDDDD..',
  'BBB..............',
  'BBB...HHH........',
  '.BB....HH........',
];
const REGIONS = { U: 'Uptown', S: 'South Channel Island', M: 'Midtown', D: 'Downtown', N: 'The Narrows', H: 'South Hinkley', B: 'Bristol Township' };
export const cellX = (col) => (col - 10) * BLOCK_SPACING; // Bristol is columns 0-2
export const cellZ = (row) => (row - 9) * BLOCK_SPACING;
// Neighbourhood names from the map.
function districtOf(region, col) {
  return {
    Uptown: col <= 11 ? 'Granton' : col <= 13 ? 'Uptown' : 'North Point',
    Midtown: col <= 9 ? 'Reatton' : col <= 13 ? 'Midtown' : 'Gainsly',
    Downtown: col <= 6 ? 'West Harlow' : col <= 9 ? 'Chinatown' : col <= 13 ? 'Stevensburgh' : 'Haysville',
  }[region] ?? region;
}

const landmarkSpecs = [
  // [name, model, [row, col], height]: each sits in its district from the map.
  ['Wayne Tower', 'wayne_tower.glb', [13, 11], 58], // Downtown; comically tall: ~3x the tallest website tower
  ['Arkham Asylum', 'arkham_asylum_8bit.glb', [10, 10], 7], // the Narrows
  ['GCPD Headquarters', 'gcpd_headquarters_8bit.glb', [1, 12], 5], // Uptown
  ['Gotham Bank', 'gotham_bank_8bit.glb', [7, 11], 6], // Midtown, the financial core
  ['Elliot Memorial', 'elliot_memorial_hospital_8bit.glb', [7, 14], 5], // Gainsly, Midtown east
  ['Ace Chemicals', 'ace_chemicals_8bit.glb', [11, 16], 6], // Haysville, Downtown's industrial east lobe
  ['Blackgate Penitentiary', 'blackgate_penitentiary_8bit.glb', [16, 7], 4], // South Hinkley
  ['Cobblepot Manor', 'cobblepot_manor_8bit.glb', [6, 1], 5], // Bristol Township, across the river
];

export const landCells = GOTHAM.flatMap((line, row) => [...line].map((code, col) => {
  if (!REGIONS[code]) return null;
  const island = REGIONS[code];
  return { sourceId: `${row},${col}`, row, col, x: cellX(col), z: cellZ(row), island, district: districtOf(island, col) };
}).filter(Boolean));

export const islands = Object.values(REGIONS).map((name) => {
  const cells = landCells.filter((c) => c.island === name);
  const minX = Math.min(...cells.map((c) => c.x - 6)), maxX = Math.max(...cells.map((c) => c.x + 6));
  const minZ = Math.min(...cells.map((c) => c.z - 6)), maxZ = Math.max(...cells.map((c) => c.z + 6));
  return { name, cells, minX, maxX, minZ, maxZ, z: (minZ + maxZ) / 2 };
});
const minX = Math.min(...islands.map((i) => i.minX)), maxX = Math.max(...islands.map((i) => i.maxX));
const minZ = Math.min(...islands.map((i) => i.minZ)), maxZ = Math.max(...islands.map((i) => i.maxZ));
export const CITY_SIZE = Math.max(maxX - minX, maxZ - minZ);
export const CITY_CENTER_X = (minX + maxX) / 2;
export const CITY_CENTER_Z = (minZ + maxZ) / 2;

// Bridges across the water, from cell edge to cell edge: [row, col] of the land at each end (same row or same column).
// Bridges across the water, from cell edge to cell edge: [row, col] of the land at each end (same row or same column),
// and which of Atharva's bridge models crosses there.
const bridgeSpans = [
  [[7, 2], [7, 5], 'gothic'], [[12, 2], [12, 5], 'gothic'], // Bristol - Reatton and West Harlow over the Gotham River
  [[3, 9], [6, 9], 'gothic'], // Uptown - Midtown over the upper inlet
  [[2, 7], [5, 7], 'gothic'], // Uptown - South Channel Island
  [[8, 8], [12, 8], 'gothic'], // Midtown - Downtown over the lower inlet
  [[8, 10], [10, 10], 'narrows'], // Midtown - the Narrows (Arkham)
  [[14, 7], [16, 7], 'blackgate'], // Downtown - South Hinkley (Blackgate)
];
export const bridges = bridgeSpans.map(([[r1, c1], [r2, c2], style]) => {
  const vertical = c1 === c2; // runs north-south
  const gap = (vertical ? Math.abs(r2 - r1) : Math.abs(c2 - c1)) * BLOCK_SPACING - BLOCK_SPACING;
  return { x: (cellX(c1) + cellX(c2)) / 2, z: (cellZ(r1) + cellZ(r2)) / 2, length: gap + 1, width: 3, vertical, style };
});

export const blocks = landCells.map((c, i) => ({ ...c, cells: [c], width: 9, depth: 9, format: i % 11 === 5 ? 'terrace' : i % 13 === 7 ? 'courtyard' : 'standard' }));
blocks.forEach((b) => { if (b.format === 'terrace') b.width = 6.5; if (b.format === 'courtyard') b.depth = 6.5; });
function merge(ids, format, district) {
  const members = ids.map((id) => blocks.find((b) => b.sourceId === id));
  if (members.some((b) => !b)) throw new Error('Missing superblock member');
  const keep = members[0];
  keep.cells = members.flatMap((b) => b.cells);
  keep.x = members.reduce((sum, b) => sum + b.x, 0) / members.length;
  keep.z = members.reduce((sum, b) => sum + b.z, 0) / members.length;
  const cols = new Set(members.map((b) => b.col)).size;
  const rows = new Set(members.map((b) => b.row)).size;
  keep.width = cols * BLOCK_SPACING - 3; keep.depth = rows * BLOCK_SPACING - 3; keep.format = format; keep.district = district;
  members.slice(1).forEach((b) => blocks.splice(blocks.indexOf(b), 1));
}
// Wayne Estate: the top of Bristol Township is one walled park, with a clearing in the middle kept for Wayne Manor.
// When the model arrives, add to landmarkSpecs: ['Wayne Manor', 'wayne_manor_8bit.glb', [2, 1], 6] and drop the
// estate's clearing size in app.js (ESTATE_CLEARING) if needed.
merge(['1,0', '1,1', '1,2', '2,0', '2,1', '2,2', '3,0', '3,1', '3,2', '4,0', '4,1', '4,2'], 'garden', 'Wayne Estate');
// Bristol Heights: the middle of Bristol Township is one suburb superblock (a spine road with cul-de-sacs, built in app.js),
// between the Wayne Estate to the north and the favelas to the south. No website plots.
merge(['7,0', '7,1', '7,2', '8,0', '8,1', '8,2', '9,0', '9,1', '9,2', '10,0', '10,1', '10,2', '11,0', '11,1', '11,2'], 'suburb', 'Bristol Heights');
merge(['3,10', '3,11'], 'garden', 'Robinson Park'); // Uptown
merge(['7,6', '7,7'], 'garden', 'Gotham Commons'); // Reatton, on the river
merge(['12,6', '12,7'], 'market', 'Chinatown Market'); // Downtown west
merge(['14,11', '14,12'], 'garden', 'Stevensburgh Green'); // Downtown, by the south shore
for (const [id, format, district] of [['13,9', 'plaza', 'Founders Square'], ['12,16', 'dockyard', 'Haysville Docks']]) {
  const b = blocks.find((block) => block.sourceId === id);
  b.format = format; b.district = district; b.width = b.depth = 9;
}

export const landmarks = landmarkSpecs.map(([name, file, [row, col], height]) => {
  const block = blocks.findIndex((b) => b.sourceId === `${row},${col}`);
  if (block < 0) throw new Error(`Missing landmark block: ${name}`);
  blocks[block].format = 'landmark';
  blocks[block].width = blocks[block].depth = 9;
  return { name, file, block, height };
});
// A bridge lands on an avenue: the block it meets gets a straight road through its middle, continuing the bridge into the
// street grid (no building plots there). Special blocks (landmarks, parks, the suburb, the market, the docks) keep their
// own layout; the bridge then meets their ring street.
for (const span of bridgeSpans) {
  for (const [row, col] of span.slice(0, 2)) {
    const block = blocks.find((b) => b.cells.some((c) => c.row === row && c.col === col));
    if (!block || !['standard', 'terrace', 'courtyard'].includes(block.format)) continue;
    block.format = 'avenue';
    block.width = block.depth = 9;
    block.avenue = span[0][0] === span[1][0] ? 'x' : 'z'; // same row: the bridge runs east-west
  }
}

export const slots = blocks.flatMap((b, block) => {
  const offsets = ['landmark','garden','plaza','dockyard','suburb','avenue'].includes(b.format) ? []
    : b.format === 'market' ? [[-7.5, 0], [-2.5, 0], [2.5, 0], [7.5, 0]]
    : b.format === 'terrace' ? [[0, -2.25], [0, 2.25]]
    : b.format === 'courtyard' ? [[-2.25, 0], [2.25, 0]]
    : [[-2.25, -2.25], [2.25, -2.25], [-2.25, 2.25], [2.25, 2.25]];
  return offsets.map(([dx, dz]) => ({ x: b.x + dx, z: b.z + dz, district: `${b.district} / ${b.island}`, block }));
});
slots.sort((a, b) => Math.hypot(a.x - CITY_CENTER_X, a.z - CITY_CENTER_Z) - Math.hypot(b.x - CITY_CENTER_X, b.z - CITY_CENTER_Z));

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
