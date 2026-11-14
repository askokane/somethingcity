import { cellX, cellZ } from './city-plan.js';

// Beaches on the Gotham map's shores; each patch covers two cells of one shoreline (centered on their shared corner).
export const beaches = [
  { name: 'Reatton Beach', x: cellX(5) + 6, z: cellZ(7) - 6, rotation: Math.PI, style: 'seaside' }, // Reatton's bulge, on the upper inlet
  { name: 'Stevensburgh Strand', x: cellX(10) + 6, z: cellZ(14) + 6, rotation: 0, style: 'strand' }, // Downtown's south shore
  { name: 'North Point Cove', x: cellX(10) + 6, z: cellZ(0) - 6, rotation: Math.PI, style: 'rocky' }, // Uptown's north shore
];

export function beachPoint(beach, x, z) {
  const c = Math.cos(beach.rotation), s = Math.sin(beach.rotation);
  return { x: beach.x + x * c + z * s, z: beach.z - x * s + z * c };
}

export function isBeachEdge(edge) {
  return edge.shore && beaches.some(b => {
    const a = beachPoint(b, -12, 0), c = beachPoint(b, 12, 0);
    return edge.vertical ? Math.abs(edge.x - a.x) < .01 && Math.abs(edge.x - c.x) < .01 && edge.z >= Math.min(a.z,c.z) && edge.z <= Math.max(a.z,c.z)
      : Math.abs(edge.z - a.z) < .01 && Math.abs(edge.z - c.z) < .01 && edge.x >= Math.min(a.x,c.x) && edge.x <= Math.max(a.x,c.x);
  });
}
