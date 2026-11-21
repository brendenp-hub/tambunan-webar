// Page 6 has one atlas-mapped environment mesh. Its GLB carries a custom
// vertex mask so only the elevated green canopy moves, not the hut or base.
export function installPage6({entry, asset, updates, resetters, restores}) {
  const meshes = [];
  let leafCount = 0;
  let motion = 0;
  if (entry.number === 6) asset.traverse(node => {
    if (!node.isMesh) return;
    const position = node.geometry.getAttribute('position');
    const mask = node.geometry.getAttribute('_wind_weight');
    if (!position || mask?.count !== position.count) return;
    const leaves = [];
    for (let i = 0; i < position.count; i++) {
      const weight = mask.getX(i);
      if (!(weight > .005)) continue;
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      leaves.push({i, x, y, z, weight, phase: x * 6.4 + z * 5.1});
    }
    if (leaves.length) meshes.push({position, leaves});
    leafCount += leaves.length;
  });
  let moving = false;
  function reset() {
    if (!moving) return;
    motion = 0;
    moving = false;
    for (const {position, leaves} of meshes) {
      for (const {i, x, y, z} of leaves) position.setXYZ(i, x, y, z);
      position.needsUpdate = true;
    }
  }
  if (meshes.length) {
    updates.push((time, reduced) => {
      if (reduced) { reset(); return; }
      moving = true;
      motion = 0;
      const fade = Math.min(1, time * 1.7);
      for (const {position, leaves} of meshes) {
        for (const {i, x, y, z, weight, phase} of leaves) {
          // At strongest this is ~3 mm on the physical A5-size model.
          const dx = weight * fade * (.015 * Math.sin(time * 1.9 + phase) + .004 * Math.sin(time * 3.8 + phase * 1.8));
          const dz = weight * fade * (.009 * Math.sin(time * 2.2 + phase + 1.1));
          position.setXYZ(i, x + dx, y, z + dz);
          motion = Math.max(motion, dx * dx + dz * dz);
        }
        position.needsUpdate = true;
      }
      motion = Math.sqrt(motion);
    });
    resetters.push(reset);
    restores.push(reset);
  }
  return {snapshot: () => ({meshCount: meshes.length, leafCount, motion})};
}
