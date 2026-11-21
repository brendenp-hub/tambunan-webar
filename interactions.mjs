import * as THREE from 'three';

// Landmarks are measured in Blender world metres; the exported scene is Y-up.
const point = ([x, y, z]) => new THREE.Vector3(x, z, -y);
const clamp = (t, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, t));
const tau = Math.PI * 2;
const forestAnimals = [
  ['Deer_A', 'Sambar deer'], ['Deer_B', 'Sambar deer'], ['Deer_C_small', 'Young sambar deer'],
  ['Boar_A', 'Wild pig', 'boar-growl'], ['Boar_piglet', 'Wild piglet', 'boar-growl']
];
// Page 3 plot centers measured on the tilled surface in Blender coordinates.
const crops = [
  ['Hill paddy', [.021, -.0225, .0349], 0x8ab44e, 0xecc56e],
  ['Corn', [.0255, -.036, .03475], 0x54843e, 0xf3ba50],
  ['Cassava', [.0215, -.065, .03445], 0x3c8c5a, 0xa9cd70],
  ['Pumpkin', [.022, -.05, .0346], 0x48794a, 0xf39738],
  ['Taro', [.0215, -.085, .03415], 0x51997a, 0x99d5a8]
];

function element(parent, tag, className, text) {
  const el = parent.ownerDocument.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  parent.append(el);
  return el;
}

/**
 * Call update after the mixer and before rendering, in seconds. root is the
 * effects group beside asset, under the same centering and normalization.
 * overlay is an empty stage-sized div; tap uses the renderer surface's rect.
 * Reset when hidden/lost; dispose only when evicting this world from the cache.
 */
export function createInteractions({entry, asset, root, overlay, dock, animations, install, sceneLights = [], finish}) {
  const group = new THREE.Group();
  group.name = 'Tambunan_Interactions';
  root.add(group);
  const layer = element(overlay, 'div', 'tambunan-fx');
  const marks = element(layer, 'div', 'tambunan-fx__marks');
  const controls = element(dock, 'div', 'tambunan-fx__controls');
  controls.dataset.page = entry.number;
  const status = element(dock, 'div', 'tambunan-fx__status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-atomic', 'true');
  const motion = overlay.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
  const targets = [], rayMeshes = [], meshTargets = new Map();
  const geometry = new Set(), materials = new Set();
  const resetters = [], updates = [], restores = [], beforeUpdates = [];

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const world = new THREE.Vector3(), view = new THREE.Vector3(), local = new THREE.Vector3();
  const hitPoint = new THREE.Vector3(), sphere = new THREE.Sphere();
  const worldScale = new THREE.Vector3();
  const intersections = [];
  let elapsed = 0, messageUntil = 0, audio, disposed = false, active = false;
  let finaleAt = Infinity, finished = false, lastAction = null, farmSnapshot;
  const activations = new Map();
  const {top = [], iso = []} = entry.landmarks ?? {};

  function own(item) {
    (item.isMaterial ? materials : geometry).add(item);
    return item;
  }
  const basic = (color, options = {}) => own(new THREE.MeshBasicMaterial({color, ...options}));
  function mesh(parent, shape, material, at) {
    const obj = new THREE.Mesh(shape, material);
    if (at) obj.position.copy(at);
    parent.add(obj);
    return obj;
  }
  function message(text, seconds = 4.8) {
    status.textContent = text;

    messageUntil = elapsed + seconds;
  }
  function stopAudio() {
    if (!audio) return;
    audio.pause();
    audio = undefined;
  }
  function play(file) {
    stopAudio();
    const Audio = overlay.ownerDocument.defaultView?.Audio;
    if (!Audio) return;
    audio = new Audio(new URL(`./assets/${file}.wav`, import.meta.url));
    audio.play()?.catch(() => {}); // The visual caption also works without audio.
  }
  function activate(item) {
    if (!active || !item.enabled) return false;
    lastAction = item.id;
    activations.set(item.id, (activations.get(item.id) ?? 0) + 1);
    item.action();
    return true;
  }
  function addTarget({id, label, short, at, radius = .008, node, action}) {
    const item = {id, at, radius, node, action, enabled: true};
    if (node) {
      node.traverse(child => {
        if (!child.isMesh) return;
        rayMeshes.push(child);
        meshTargets.set(child, item);
      });
    }
    if (short) {
      const text = ({river:'River', cloud:'Gombunan', elders:'Elders', campfire:'Campfire', tamasin:'Tamasin', gate:'Gate'})[id]
        ?? (id.startsWith('deer-') ? `Deer ${short}` : id === 'boar-piglet' ? 'Piglet' : id === 'boar-a' ? 'Wild boar' : short);
      const b = item.button = element(controls, 'button', 'tambunan-fx__target', text);
      b.type = 'button';
      b.dataset.action = id;
      b.setAttribute('aria-label', label);
      b.hidden = true;
      b.addEventListener('click', () => activate(item));
    }
    targets.push(item);
    return item;
  }
  function project(position, camera, el) {
    if (!el) return;
    view.copy(position).applyMatrix4(camera.matrixWorldInverse);
    if (view.z >= 0) { el.hidden = true; return; }
    view.copy(position).project(camera);
    el.hidden = !Number.isFinite(view.x + view.y + view.z) || Math.abs(view.x) > .98 || Math.abs(view.y) > .94 || Math.abs(view.z) > 1;
    if (!el.hidden) {
      el.style.left = `${50 + 50 * view.x}%`;
      el.style.top = `${50 - 50 * view.y}%`;
    }
  }
  function prepare(camera) {
    // update runs before renderer.render(), including the first frame and
    // matrixAutoUpdate=false AR anchors. Refresh both camera and asset branches.
    camera.updateWorldMatrix(true, false);
    root.updateWorldMatrix(true, true);
    if (asset.parent !== root) asset.updateWorldMatrix(true, true);
  }

  // Lightweight deterministic particles; all geometry/materials are shared
  // within each emitter. Distances remain in diorama metres.
  function particles(at, color, {count = 12, spread = .02, lift = .03, size = .0015, speed = 1, burst = false, foreground = false} = {}) {
    const shell = new THREE.Group();
    shell.position.copy(at);
    group.add(shell);
    const shape = own(new THREE.OctahedronGeometry(size));
    const material = basic(color, foreground ? {depthTest: false, depthWrite: false, transparent: true, toneMapped: false} : {});
    const dots = Array.from({length: count}, () => {
      const dot = mesh(shell, shape, material);
      if (foreground) dot.renderOrder = 3;
      return dot;
    });
    return (time, strength = 1, origin) => {
      if (origin) shell.position.copy(origin);
      shell.visible = time >= 0 && strength > 0;
      if (!shell.visible) return;
      for (let i = 0; i < count; i++) {
        const phase = (i * .61803399) % 1;
        const p = burst ? clamp(time * speed - phase * .23) : (time * speed + phase) % 1;
        const a = i * 2.39996 + p * (burst ? .4 : 1.4);
        const r = spread * (.28 + phase * .72) * (burst ? p : .65 + .35 * Math.sin(p * Math.PI));
        const dot = dots[i];
        dot.position.set(Math.cos(a) * r, lift * (burst ? Math.sin(p * Math.PI * .83) : p), Math.sin(a) * r);
        dot.scale.setScalar(Math.sin(p * Math.PI) * strength);
        dot.rotation.set(a, p * tau, i);
      }
    };
  }

  if (entry.number === 1) {
    const river = top.map(p => point([p[0], p[1], p[2] + .00045]));
    if (river.length >= 2) {
      let flowAt = Infinity;
      const curve = new THREE.CatmullRomCurve3(river);
      const strip = own(new THREE.BufferGeometry());
      const sections = 64, coords = [], uv = [], indices = [];
      for (let i = 0; i <= sections; i++) {
        const t = i / sections, p = curve.getPoint(t), tangent = curve.getTangent(t);
        const width = .0017 + t * .0015;
        for (const side of [-1, 1]) {
          coords.push(p.x + tangent.z * width * side, p.y, p.z - tangent.x * width * side);
          uv.push((side + 1) / 2, t);
        }
        if (i < sections) {
          const j = i * 2;
          indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
        }
      }
      strip.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
      strip.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      strip.setIndex(indices);
      const flow = own(new THREE.ShaderMaterial({
        uniforms: {clock: {value: 0}, strength: {value: 0}}, transparent: true, side: THREE.DoubleSide, depthWrite: false,
        vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `uniform float clock; uniform float strength; varying vec2 vUv;
          void main(){
            float streak = smoothstep(.70,.94,sin(81.*vUv.y - 4.*clock + vUv.x*2.));
            float edge = sin(3.14159*vUv.x)*sin(3.14159*vUv.y);
            gl_FragColor=vec4(.63,.94,.97,strength*edge*(.13+.42*streak));
            #include <encodings_fragment>
          }`
      }));
      const ribbon = mesh(group, strip, flow);
      const startFlow = () => { flowAt = elapsed; message('The river is flowing.'); };
      addTarget({id: 'river', label: 'Set the river flowing', short: '≈', at: river[river.length - 3] ?? river[0], radius: .009, action: startFlow});
      addTarget({id: 'river', label: 'Set the river flowing', node: ribbon, action: startFlow});
      updates.push((t, reduced) => {
        // Keep the ribbon ray-pickable before activation; render with zero alpha.
        flow.uniforms.strength.value = Number.isFinite(flowAt) ? 1 : 0;
        flow.uniforms.clock.value = reduced || !Number.isFinite(flowAt) ? 0 : elapsed - flowAt;
      });
      resetters.push(() => { flowAt = Infinity; flow.uniforms.strength.value = 0; });
    }
    for (let i = 0; i < forestAnimals.length; i++) {
      const [name, label, sound = 'forest'] = forestAnimals[i];
      const node = asset.getObjectByName(name);
      if (node) addTarget({id: name.toLowerCase().replaceAll('_', '-'), node, label: `Listen: ${label}`, short: String(i + 1), action() {
        message(label); play(sound);
      }});
    }
  }

  if (entry.number === 3) {
    let next = 0;
    const plots = [];
    const stem = own(new THREE.CylinderGeometry(.00045, .00062, .01, 5));
    const leaf = own(new THREE.SphereGeometry(1, 6, 4));
    const tip = own(new THREE.SphereGeometry(1, 7, 5));
    const mound = own(new THREE.CylinderGeometry(.0036, .0046, .00075, 7));
    const soil = basic(0x775138);
    const order = [3, 0, 1, 2, 4]; // Start with the most recognisable crop.
    const growth = crops.map(() => Infinity);
    const plants = crops.map(() => []);
    const ring = mesh(group, own(new THREE.RingGeometry(.010, .0125, 32)), basic(0xffdc80, {
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 2;
    const burstAt = new THREE.Vector3();
    const spark = particles(burstAt, 0xffdf8e, {count: 14, spread: .024, lift: .029, size: .0027, speed: 1.2, burst: true, foreground: true});
    let effectAt = Infinity, effectCrop = null, farmAudio;
    const notes = new Set();
    function playPlantChime() {
      const win = overlay.ownerDocument.defaultView;
      const Context = win?.AudioContext ?? win?.webkitAudioContext;
      if (!Context) return;
      try {
        farmAudio ??= new Context();
        farmAudio.resume().catch(() => {});
        const start = farmAudio.currentTime + .012;
        for (const [offset, from, to, volume, length] of [[0, 225, 85, .26, .12], [.065, 660, 660, .15, .17], [.14, 990, 990, .12, .24]]) {
          const at = start + offset;
          const note = farmAudio.createOscillator(), gain = farmAudio.createGain();
          note.type = offset ? 'sine' : 'triangle';
          note.frequency.setValueAtTime(from, at);
          note.frequency.exponentialRampToValueAtTime(to, at + length);
          gain.gain.setValueAtTime(.001, at);
          gain.gain.exponentialRampToValueAtTime(volume, at + .012);
          gain.gain.exponentialRampToValueAtTime(.001, at + length);
          note.connect(gain); gain.connect(farmAudio.destination);
          note.onended = () => { notes.delete(note); note.disconnect(); gain.disconnect(); };
          note.start(at); notes.add(note); note.stop(at + length);
        }
      } catch { /* The visual planting feedback still works without audio. */ }
    }
    restores.push(() => farmAudio?.close().catch(() => {}));
    const pumpkinSkin = own(new THREE.MeshStandardMaterial({color: 0xff8623, roughness: .72, flatShading: true}));
    const pumpkinRib = own(new THREE.SphereGeometry(1, 10, 7));
    function plant(index, pos, green, fruit) {
      const sprout = new THREE.Group();
      group.add(sprout);
      sprout.position.copy(pos);
      const branch = (x, y, z, w, h, d, rz = 0, ry = 0) => {
        const l = mesh(sprout, leaf, green);
        l.position.set(x, y, z); l.scale.set(w, h, d); l.rotation.set(0, ry, rz);
      };
      const produce = (x, y, z, w, h, d, rz = 0, ry = 0) => {
        const f = mesh(sprout, tip, fruit);
        f.position.set(x, y, z); f.scale.set(w, h, d); f.rotation.set(0, ry, rz);
      };
      if (index === 0) {
        for (const side of [-1, 0, 1]) {
          const stalk = mesh(sprout, stem, green);
          stalk.position.set(side * .0013, .0044, 0); stalk.scale.set(.75, .89, .75); stalk.rotation.z = side * -.19;
          branch(side * .0025, .0042, 0, .00075, .0028, .0006, side * -.75);
          produce(side * .00225, .0095, 0, .0008, .0021, .0008, side * -.19);
        }
      } else if (index === 1) {
        const stalk = mesh(sprout, stem, green);
        stalk.position.y = .008; stalk.scale.y = 1.6;
        for (const s of [-1, 1]) {
          branch(s * .0024, .006 + s * .0015, 0, .0015, .0047, .0009, s * -.9);
          produce(s * .0015, .0102 + s * .0014, 0, .0012, .0031, .0014, s * -.48);
        }
      } else if (index === 2) {
        mesh(sprout, stem, green).position.y = .005;
        for (let k = 0; k < 7; k++) {
          const a = k * tau / 7;
          branch(.003 * Math.cos(a), .01, -.003 * Math.sin(a), .0036, .00065, .0012, .25, a);
        }
        produce(.0014, .001, .0012, .0018, .001, .0016);
      } else if (index === 3) {
        for (let k = 0; k < 3; k++) {
          const a = k * tau / 3;
          branch(.0038 * Math.cos(a), .0016, -.0038 * Math.sin(a), .0032, .0008, .002, .13, a);
        }
        for (let k = 0; k < 9; k++) {
          const a = k * tau / 9;
          const rib = mesh(sprout, pumpkinRib, pumpkinSkin);
          rib.position.set(.0034 * Math.cos(a), .0056, .0034 * Math.sin(a));
          rib.scale.set(.0067, .0056, .0043);
          rib.rotation.y = -a;
        }
        const stalk = mesh(sprout, stem, green);
        stalk.position.set(.0005, .0117, 0); stalk.scale.set(2.0, .31, 2.0); stalk.rotation.z = -.38;
      } else {
        for (const s of [-1, 1]) {
          const stalk = mesh(sprout, stem, green);
          stalk.position.set(s * .0013, .004, 0); stalk.rotation.z = s * -.36; stalk.scale.y = .85;
          branch(s * .0027, .008, 0, .004, .00085, .0034, s * -.35);
          produce(s * .0027, .0088, 0, .0029, .00025, .00036, s * -.35);
        }
      }
      sprout.visible = false;
      return sprout;
    }
    crops.forEach(([label, center, color, accent], i) => {
      const pos = point(center);
      const green = basic(color), fruit = basic(accent);
      const shoots = plants[i] = (i === 3 ? [0] : [-1, 1]).map(side => {
        const location = pos.clone().add(new THREE.Vector3(side * .0026, 0, side * .0022));
        mesh(group, mound, soil, location);
        return plant(i, location, green, fruit);
      });
      const prompt = `Plant ${label.toLowerCase()}`;
      const item = addTarget({id: `plant-${label.toLowerCase().replaceAll(' ', '-')}`, label: prompt, short: prompt, at: pos.clone().add(new THREE.Vector3(0, .006, 0)), radius: .008, action() {
        if (i !== order[next]) return;
        growth[i] = effectAt = elapsed;
        effectCrop = label;
        ring.position.copy(pos); ring.position.y += .002;
        burstAt.copy(pos); burstAt.y += .004;
        playPlantChime();
        plots[i].enabled = false;
        next++;
        message(next === order.length ? '5 of 5 planted · The field is complete!' : `${label} planted! · ${next} of 5`);
      }});
      item.button.classList.add('tambunan-fx__plant');
      item.enabled = i === order[0];
      plots.push(item);
      updates.push((t, reduced) => shoots.forEach((shoot, j) => {
        const age = elapsed - growth[i] - j * .09;
        shoot.visible = Number.isFinite(growth[i]) && (age >= 0 || reduced);
        const progress = clamp(age / .62), pop = 1 - (1 - progress) ** 3 + .24 * Math.sin(Math.PI * progress);
        const size = i === 3 ? 1 : 1.26;
        shoot.scale.setScalar(size * (reduced ? 1 : Math.max(.12, pop)));
        shoot.position.y = pos.y + (reduced || !shoot.visible ? 0 : (i === 3 ? .021 : .012) * Math.sin(progress * Math.PI));
      }));
    });
    updates.push((t, reduced) => {
      const age = elapsed - effectAt;
      ring.visible = age >= 0 && age < .95;
      if (ring.visible) {
        ring.scale.setScalar(reduced ? 1.55 : .9 + 1.8 * age);
        ring.material.opacity = .94 * (1 - age / .95);
      }
      spark(ring.visible && !reduced ? age : -1, 1, burstAt);
      if (effectCrop && (age >= .78 || reduced) && order[next] !== undefined) plots[order[next]].enabled = true;
      if (!ring.visible) effectCrop = null;
    });
    resetters.push(() => {
      next = 0; growth.fill(Infinity); effectAt = Infinity; effectCrop = null;
      ring.visible = false; spark(-1);
      for (const shoots of plants) for (const shoot of shoots) shoot.visible = false;
      for (const note of notes) { note.disconnect(); note.stop(); }
      notes.clear();
      plots.forEach((p, i) => { p.enabled = i === order[0]; });
    });
    farmSnapshot = () => ({
      grown: order.filter(i => plants[i].some(shoot => shoot.visible)).map(i => crops[i][0]),
      burst: ring.visible ? effectCrop : null
    });
  }

  if (entry.number === 7) {
    const apparition = asset.getObjectByName('Gombunan_Apparition');
    const cloudAt = point(iso[1] ?? [0, -.009, .128]);
    const textAt = point(iso[4] ?? [-.024, -.026, .034]).add(new THREE.Vector3(0, .022, 0));
    const title = element(marks, 'span', 'tambunan-fx__story-word tambunan-fx__rise', 'GOMBUNAN');
    title.setAttribute('aria-hidden', 'true');
    let revealAt = Infinity, nameAt = Infinity;
    const fades = [];
    if (apparition) {
      const wasVisible = apparition.visible;
      restores.push(() => { apparition.visible = wasVisible; });
      apparition.traverse(node => {
        if (!node.isMesh) return;
        const source = node.material;
        const prepareMaterial = mat => {
          const copy = own(mat.clone());
          fades.push([copy, mat.opacity, mat.transparent, mat.depthWrite]);
          return copy;
        };
        node.material = Array.isArray(source) ? source.map(prepareMaterial) : prepareMaterial(source);
        restores.push(() => { node.material = source; });
      });
    }
    const cloud = new THREE.Group();
    group.add(cloud);
    cloud.position.copy(cloudAt);
    const puffShape = own(new THREE.IcosahedronGeometry(.009, 1));
    const lilac = basic(0xbdb3dd), ice = basic(0xe4dff2);
    for (let k = 0; k < 5; k++) {
      const p = mesh(cloud, puffShape, k % 2 ? ice : lilac);
      p.position.set((k - 2) * .0063, Math.sin(k) * .003, Math.cos(k) * .003);
      p.scale.set(1.15, .67 + .09 * k, .64);
    }
    const cloudTarget = addTarget({id: 'cloud', label: 'Reveal Gombunan', short: '✦', at: cloudAt, radius: .023, action() {
      revealAt = elapsed;
      cloudTarget.enabled = false;
      message('No one should go hungry while we have food to share.', 6.5);
      play('gombunan');
    }});
    const elderAction = () => { nameAt = elapsed; message('Gombunan'); };
    let elders = 0;
    asset.traverse(node => {
      if (!node.isMesh || !/^Mourner_(?:\d+)(?:_\w+)?$/i.test(node.name) || /_rig$/i.test(node.name)) return;
      addTarget({id: 'elders', label: 'Listen to the elders', short: elders++ === 0 ? '…' : '', node, action: elderAction});
    });
    if (!elders) addTarget({id: 'elders', label: 'Listen to the elders', short: '…', at: textAt.clone().add(new THREE.Vector3(0, -.014, 0)), radius: .017, action: elderAction});
    updates.push((t, reduced, camera) => {
      cloud.visible = !Number.isFinite(revealAt);
      cloud.position.y = cloudAt.y + Math.sin(t * 2) * .0015;
      if (apparition) {
        const age = elapsed - revealAt;
        const opacity = reduced ? 1 : clamp(age / .95);
        apparition.visible = age >= 0;
        if (apparition.visible) for (const [mat, base, transparent, depthWrite] of fades) {
          mat.opacity = base * opacity;
          mat.transparent = opacity < 1 || transparent;
          mat.depthWrite = opacity >= 1 && depthWrite;
        }
      }
      const age = elapsed - nameAt;
      if (age < 0 || age > 2.6) title.hidden = true;
      else {
        local.copy(textAt);
        if (!reduced) local.y += .032 * clamp(age / 2.6);
        project(group.localToWorld(local), camera, title);
        title.style.opacity = reduced ? '1' : String(clamp((2.6 - age) * 2.6));
      }
    });
    resetters.push(() => {
      cloudTarget.enabled = true; revealAt = nameAt = Infinity; cloud.visible = true; title.hidden = true;
      if (apparition) apparition.visible = false;
    });
  }

  if (entry.number === 9) {
    const measured = top[0] ?? [.028, -.031, .04758];
    const hearth = point([measured[0], measured[1] - .002, .039]);
    const fireAt = hearth.clone().add(new THREE.Vector3(0, .011, 0));
    const flicker = new THREE.Group();
    group.add(flicker);
    flicker.position.copy(hearth);
    const tongue = own(new THREE.ConeGeometry(.0029, .012, 5));
    const colors = [0xf18a32, 0xffd064, 0xec642d].map(color => basic(color));
    const flames = colors.map((mat, i) => {
      const f = mesh(flicker, tongue, mat);
      f.position.set((i - 1) * .0034, .006, Math.sin(i * 4) * .0017);
      return f;
    });
    const fireflies = particles(hearth, 0xf5e99a, {count: 11, spread: .025, lift: .038, size: .00105, speed: .48});
    let fireTime = -Infinity;
    const originalFlames = asset.getObjectByName('CampfireFlames');
    const terrain = asset.getObjectByName('Environment').material;
    const originalEmission = terrain.emissiveIntensity;
    const intensities = sceneLights.map(light => light.intensity);
    const glow = new THREE.PointLight(0xffa14d, 1.8, 1, 1);
    glow.position.copy(fireAt);
    group.add(glow);
    let lit = true;
    function setFire(on) {
      lit = on;
      originalFlames.visible = flicker.visible = glow.visible = on;
      terrain.emissiveIntensity = on ? originalEmission : 0;
      sceneLights.forEach((light, i) => { light.intensity = intensities[i] * (on ? .8 : .065); });
      fireflies(-1);
      target.button.textContent = on ? 'Put out fire' : 'Light fire';
      target.button.setAttribute('aria-label', target.button.textContent);
    }
    const target = addTarget({id: 'campfire', label: 'Put out fire', short: 'Campfire', at: fireAt, radius: .017, action() {
      setFire(!lit);
      fireTime = lit ? elapsed : -Infinity;
      message(lit ? 'The campfire lights up the clearing.' : 'The fire is out.');
    }});
    const tamasin = asset.getObjectByName('Tamasin_sitting');
    if (tamasin) addTarget({id: 'tamasin', node: tamasin, label: 'Listen to Tamasin', short: '…', action() {
      message('We are stronger when we stand together.', 6.5);
      play('tamasin');
    }});
    updates.push((t, reduced) => {
      const age = elapsed - fireTime;
      const pulse = age < 3.4 ? (reduced ? .72 : Math.exp(-age * .8)) : 0;
      glow.distance = .15 * group.getWorldScale(worldScale).x;
      glow.intensity = reduced ? 1.8 : 1.8 + .12 * Math.sin(t * 7);
      if (!lit) return;
      flames.forEach((f, i) => {
        f.rotation.z = .25 * Math.sin(t * 8 + i * 2);
        f.scale.set(.68 + pulse * .44, .68 + pulse * .8 + .16 * Math.sin(t * 13 + i * 2), .68 + pulse * .44);
      });
      fireflies(age < 4.6 ? (reduced ? .65 : age) : -1, reduced ? 1 : clamp((4.6 - age) / .7));
    });
    resetters.push(() => { fireTime = -Infinity; setFire(true); });
  }

  if (entry.number === 12) {
    const gate = point(iso[0] ?? [.00503, -.00408, .0678]);
    const wordAt = gate.clone().add(new THREE.Vector3(0, .026, 0));
    const word = element(marks, 'span', 'tambunan-fx__story-word tambunan-fx__join');
    word.setAttribute('aria-hidden', 'true');
    element(word, 'span', '', 'TAM');
    element(word, 'span', '', 'BUNAN');
    const gold = particles(gate, 0xf4c76d, {count: 17, spread: .045, lift: .05, speed: .49, burst: true});
    const jade = particles(gate, 0x8ed5ab, {count: 14, spread: .037, lift: .04, size: .00125, speed: .54, burst: true});
    const gateTarget = addTarget({id: 'gate', label: 'Celebrate at the Tambunan gate', short: '✦', at: gate, radius: .022, action() {
      if (Number.isFinite(finaleAt)) return;
      gateTarget.enabled = false; finaleAt = elapsed; message('Tambunan', 3);
    }});
    updates.push((t, reduced, camera) => {
      if (!Number.isFinite(finaleAt) || finished) { word.hidden = true; gold(-1); jade(-1); return; }
      const age = elapsed - finaleAt;
      project(group.localToWorld(local.copy(wordAt)), camera, word);
      const p = reduced ? 1 : 1 - (1 - clamp(age / 1.05)) ** 3;
      word.style.setProperty('--tambunan-word-gap', `${(1 - p) * 33}px`);
      gold(reduced ? .72 : age);
      jade(reduced ? .9 : age - .19);
    });
    resetters.push(() => { gateTarget.enabled = true; word.hidden = true; gold(-1); jade(-1); });
  }

  const hooks = {entry, asset, group, addTarget, updates, beforeUpdates, resetters, restores, message, own, animations};
  const chapterInteraction = install?.(hooks);

  function update(dt, camera) {
    if (disposed) return;
    const shown = group.getWorldScale(worldScale).lengthSq() > 0 && visible(group);
    if (!shown || !camera) {
      if (active) reset();
      return;
    }
    active = true;
    layer.hidden = false;
    const delta = Number.isFinite(dt) ? clamp(dt, 0, .25) : 0;
    elapsed += delta;
    const reduced = motion?.matches ?? false;
    const t = reduced ? 0 : elapsed;
    prepare(camera);
    for (const step of updates) step(t, reduced, camera);
    for (const item of targets) if(item.button) item.button.hidden = !item.enabled || !!item.node && !visible(item.node);
    if (elapsed >= messageUntil && status.textContent) status.textContent = '';
    if (elapsed - finaleAt >= (reduced ? 1.05 : 2.6) && !finished) {
      finished = true;
      finish?.();
    }
  }
  function visible(obj) {
    for (; obj; obj = obj.parent) if (!obj.visible) return false;
    return true;
  }
  function tap(clientX, clientY, surface, camera) {
    if (!active || disposed || !camera || !visible(group)) return false;
    const rect = surface.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width, y = (clientY - rect.top) / rect.height;
    if (!Number.isFinite(x + y) || x < 0 || x > 1 || y < 0 || y > 1) return false;
    prepare(camera);
    ndc.set(x * 2 - 1, 1 - y * 2);
    if (camera.isPerspectiveCamera || camera.isOrthographicCamera) {
      ray.setFromCamera(ndc, camera);
    } else {
      // The app uses a plain THREE.Camera with MindAR's perspective matrix.
      ray.ray.origin.setFromMatrixPosition(camera.matrixWorld);
      ray.ray.direction.set(ndc.x, ndc.y, .5).unproject(camera).sub(ray.ray.origin).normalize();
    }
    intersections.length = 0;
    for (const mesh of rayMeshes) {
      const item = meshTargets.get(mesh);
      if (!item.enabled || !visible(mesh) || !mesh.layers.test(ray.layers)) continue;
      if (mesh.isSkinnedMesh) {
        // In r152 the inherited mesh raycast early-outs against undeformed
        // geometry bounds. Use fresh posed bounds without mutating the GLB.
        mesh.updateMatrixWorld(true);
        mesh.computeBoundingSphere();
        sphere.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld);
        sphere.radius *= 1.13;
        if (ray.ray.intersectSphere(sphere, hitPoint)) {
          intersections.push({object: mesh, point: hitPoint.clone(), distance: ray.ray.origin.distanceTo(hitPoint)});
        }
      } else ray.intersectObject(mesh, false, intersections);
    }
    intersections.sort((a, b) => a.distance - b.distance);
    let best, distance = Infinity;
    for (const hit of intersections) {
      const item = meshTargets.get(hit.object);
      if (item.enabled && visible(hit.object) && view.copy(hit.point).project(camera).z >= -1 && view.z <= 1) {
        best = item; distance = hit.distance; break;
      }
    }
    group.getWorldScale(worldScale);
    for (const item of targets) {
      if (!item.at || !item.enabled) continue;
      group.localToWorld(sphere.center.copy(item.at));
      sphere.radius = item.radius * Math.max(worldScale.x, worldScale.y, worldScale.z);
      if (ray.ray.intersectSphere(sphere, hitPoint)) {
        const d = ray.ray.origin.distanceTo(hitPoint);
        view.copy(hitPoint).project(camera);
        if (d < distance && view.z >= -1 && view.z <= 1) { best = item; distance = d; }
      }
    }
    return best ? activate(best) : false;
  }
  function reset() {
    if (disposed) return;
    active = false;
    layer.hidden = true;
    elapsed = messageUntil = 0;
    finaleAt = Infinity; finished = false;
    lastAction = null; activations.clear();
    stopAudio(); message('');
    for (const item of targets) if (item.button) item.button.hidden = true;
    for (const fn of resetters) fn();
  }
  function dispose() {
    if (disposed) return;
    reset(); disposed = true;
    layer.remove(); dock.remove(); group.removeFromParent();
    for (const fn of restores) fn();
    for (const item of geometry) item.dispose();
    for (const item of materials) item.dispose();
  }
  function snapshot() {
    return {
      page: entry.number, active, lastAction, activations: Object.fromEntries(activations),
      availableActions: [...new Set(targets.filter(item => item.enabled).map(item => item.id))],
      message: status.textContent || null,
      farm: farmSnapshot?.(),
      extra: chapterInteraction?.snapshot?.(),
      finale: finished ? 'finished' : Number.isFinite(finaleAt) ? 'playing' : 'idle'
    };
  }
  reset();
  return {update, tap, reset, dispose, snapshot, hasControls: targets.some(item=>item.button), beforeUpdate:()=>{for(const fn of beforeUpdates)fn();}};
}
