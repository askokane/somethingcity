export const beaches = [
  { name: 'West Bay Beach', x: -51, z: 30, rotation: -Math.PI / 2, style: 'seaside' },
  { name: 'South Strand', x: 15, z: 66, rotation: 0, style: 'strand' },
  { name: 'North Head Cove', x: -87, z: -78, rotation: -Math.PI / 2, style: 'rocky' },
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
