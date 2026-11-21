import {Quaternion, Vector3} from 'three';

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function installPage8({asset, addTarget, beforeUpdates, updates, resetters, message}) {
  const mesh = asset.getObjectByName('Tamasin_walker');
  const rig = asset.getObjectByName('Tamasin_walker_rig');
  const bones = mesh?.skeleton?.bones ?? [];
  // GLTFLoader removes punctuation and adds suffixes for duplicate bone names.
  const upper = bones.find(bone => /^upperarmL(?:_\d+)?$/.test(bone.name));
  const forearm = upper?.children.find(bone => /^forearmL(?:_\d+)?$/.test(bone.name));
  const hand = forearm?.children.find(bone => /^handL(?:_\d+)?$/.test(bone.name));
  const head = bones.find(bone => /^head(?:_\d+)?$/.test(bone.name));
  if (!rig || !head || !upper || !forearm || !hand) throw new Error('Page 8 is missing Tamasin’s left arm rig.');

  const upperAxis = forearm.position.clone().normalize();
  const forearmAxis = hand.position.clone().normalize();
  const upperBase = new Quaternion(), forearmBase = new Quaternion();
  const parentInRig = new Quaternion(), inverseParent = new Quaternion();
  const swing = new Quaternion(), pose = new Quaternion();
  const current = new Vector3(), desired = new Vector3();
  const facingBase = new Quaternion(), headBase = new Quaternion(), facing = new Quaternion();
  const cameraPoint = new Vector3(), headPoint = new Vector3();
  const up = new Vector3(0, 1, 0), right = new Vector3(1, 0, 0);
  const raised = new Vector3(.36, -.73, .58).normalize();
  let now = 0, started = null, applied = false, reducedMotion = false;

  function restore() {
    if (!applied) return;
    rig.quaternion.copy(facingBase);
    head.quaternion.copy(headBase);
    upper.quaternion.copy(upperBase);
    forearm.quaternion.copy(forearmBase);
    applied = false;
  }
  function aim(bone, axis, direction, weight) {
    current.copy(axis).applyQuaternion(bone.quaternion);
    swing.setFromUnitVectors(current, direction);
    pose.copy(bone.quaternion).premultiply(swing);
    bone.quaternion.slerp(pose, weight);
  }

  addTarget({
    id: 'tamasin-wave', node: mesh, short: 'Wave', label: 'Make Tamasin wave',
    action() {
      if (started !== null) return;
      message(reducedMotion ? 'Tamasin greets you.' : 'Tamasin waves hello!');
      if (!reducedMotion) started = now;
    }
  });

  // Restore the previous frame before the walking mixer supplies the next pose.
  beforeUpdates.push(restore);
  updates.push((time, reduced, camera) => {
    now = time;
    reducedMotion = reduced;
    if (started === null) return;
    const age = time - started;
    const duration = 2.1;
    if (reduced || age >= duration) {
      restore();
      started = null;
      return;
    }

    const weight = smoothstep(age / .35) * smoothstep((duration - age) / .35);
    facingBase.copy(rig.quaternion);
    headBase.copy(head.quaternion);
    rig.parent.worldToLocal(camera.getWorldPosition(cameraPoint));
    rig.parent.worldToLocal(head.getWorldPosition(headPoint));
    cameraPoint.sub(headPoint);
    const horizontal = Math.hypot(cameraPoint.x, cameraPoint.z);
    if (horizontal > .0001) {
      facing.setFromAxisAngle(up, Math.atan2(cameraPoint.x, cameraPoint.z));
      rig.quaternion.slerp(facing, weight);
    }
    const elevation = Math.atan2(cameraPoint.y, horizontal);
    head.rotateOnAxis(right, -Math.max(-.35, Math.min(.95, elevation)) * weight);

    upperBase.copy(upper.quaternion);
    forearmBase.copy(forearm.quaternion);

    // Aim in Tamasin’s local frame so the hand follows him along the path.
    parentInRig.identity();
    for (let parent = upper.parent; parent && parent !== rig; parent = parent.parent) {
      parentInRig.premultiply(parent.quaternion);
    }
    desired.copy(raised).applyQuaternion(inverseParent.copy(parentInRig).invert());
    aim(upper, upperAxis, desired, weight);

    const sway = Math.sin((age - .35) * Math.PI * 3.6);
    parentInRig.multiply(upper.quaternion);
    desired.set(.18 + .33 * sway, .85, .51).normalize()
      .applyQuaternion(inverseParent.copy(parentInRig).invert());
    aim(forearm, forearmAxis, desired, weight);

    applied = true;
    rig.updateMatrixWorld(true);
  });
  resetters.push(() => { restore(); started = null; now = 0; });
}
