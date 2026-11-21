import {Quaternion, Vector3} from 'three';

const clamp = t => Math.max(0, Math.min(1, t));
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };

export function installPage4({asset, animations, addTarget, beforeUpdates, updates, resetters, message}) {
  const mesh = asset.getObjectByName('Gombunan_idle');
  const rig = asset.getObjectByName('Gombunan_idle_rig');
  const clip = animations?.find(a => a.name === 'Page4_Wave');
  if (!mesh?.isSkinnedMesh || !rig || !clip) throw new Error('Page 4 is missing its standing man or wave animation.');

  // Use the exported joint tracks without running a second mixer over the idle pose.
  const joints = new Map(mesh.skeleton.bones.map(bone => [bone.name, bone]));
  const tracks = clip.tracks.map(track => {
    const bone = joints.get(track.name.replace(/\.quaternion$/, ''));
    if (!bone || !track.name.endsWith('.quaternion')) throw new Error(`Invalid Page 4 wave track: ${track.name}`);
    return {bone, sample: track.createInterpolant(), base: new Quaternion()};
  });
  const baseFacing = rig.quaternion.clone();
  const destination = new Quaternion(), sampleRotation = new Quaternion();
  const cameraPosition = new Vector3(), up = new Vector3(0, 1, 0);
  let now = 0, started = null, destinationKnown = false, applied = false;
  let phase = 'idle', turn = 0, arm = 0, reduceMotion = false;

  function restore() {
    if (!applied) return;
    rig.quaternion.copy(baseFacing);
    for (const {bone, base} of tracks) bone.quaternion.copy(base);
    applied = false;
  }
  function finish() {
    restore();
    started = null; destinationKnown = false;
    phase = 'idle'; turn = arm = 0;
    target.enabled = true;
  }
  const target = addTarget({
    id: 'wave', node: mesh, short: 'Wave', label: 'Wave to the man in blue',
    action() {
      if (started !== null) return;
      if (reduceMotion) { message('The man in blue greets you.'); return; }
      started = now;
      phase = 'turning';
      target.enabled = false;
      message('The man in blue waves hello!', 3.4);
    }
  });
  beforeUpdates.push(restore);
  updates.push((t, reduced, camera) => {
    now = t; reduceMotion = reduced;
    if (started === null) return;
    const age = now - started;
    const waveStart = .24, turnEnd = .58, returnStart = clip.duration + .04, end = clip.duration + .64;
    if (reduced || age >= end) { finish(); return; }
    if (!destinationKnown) {
      rig.parent.worldToLocal(camera.getWorldPosition(cameraPosition)).sub(rig.position);
      if (Math.hypot(cameraPosition.x, cameraPosition.z) > 1e-5) {
        destination.setFromAxisAngle(up, Math.atan2(cameraPosition.x, cameraPosition.z));
      } else destination.copy(baseFacing);
      destinationKnown = true;
    }
    phase = age < turnEnd ? 'turning' : age < returnStart ? 'waving' : 'returning';
    rig.quaternion.copy(baseFacing).slerp(destination, smooth(age / turnEnd) * (1 - smooth((age - returnStart) / (end - returnStart))));
    turn = baseFacing.angleTo(rig.quaternion);
    const waveTime = age - waveStart;
    const weight = smooth(waveTime / .18) * smooth((clip.duration - waveTime) / .21);
    arm = 0;
    for (const {bone, base, sample} of tracks) {
      base.copy(bone.quaternion);
      if (weight === 0) continue;
      bone.quaternion.slerp(sampleRotation.fromArray(sample.evaluate(waveTime)), weight);
      arm = Math.max(arm, base.angleTo(bone.quaternion));
    }
    applied = true;
    // The scene matrices were prepared before this callback. Publish the wave
    // immediately for rendering and for taps between frames.
    rig.updateMatrixWorld(true);
  });
  resetters.push(() => { finish(); now = 0; });
  return {snapshot: () => ({phase, turn, arm})};
}
