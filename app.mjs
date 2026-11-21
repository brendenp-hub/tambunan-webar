import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {DRACOLoader} from './vendor/DRACOLoader.js';
import {fit, liftTilt, ease, zoomBy, pitchBy, groundSpan, pageOrientation, pageFootprint} from './layout.mjs?v=portrait1';

import {chapters, chapterFor, choosePose} from './chapters.mjs?v=campfire2';
import {createInteractions} from './interactions.mjs?v=campfire2';

const $=id=>document.getElementById(id);
const stage=$('stage'), surface=$('surface'), guide=$('guide'), overlayHost=$('story-effects'), dockHost=$('story-dock'), finale=$('finale');
const scan=$('scan'), preview=$('preview'), tools=$('model-tools');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const params=new URLSearchParams(location.search);
const arCam=new THREE.Camera(), models=new Map();
let chapter=chapters.find(c=>c.number===Number(params.get('page')||1))??chapters[0], renderer;
const states={
 idle:['Camera off','Ready to scan','Place the page flat, with the bottom edge closest to you.'],
 starting:['Starting camera','Opening camera…','Allow camera access if your browser asks.'],
 'camera-video':['Camera connected','Starting live video…','Waiting for the first frame.'],
 preparing:['Camera on','Preparing the scanner…','Keep the full page in view.'],
 scanning:['Scanning','Scan any supported page','Pages 1–12 · keep all four corners in view'],
 'scene-loading':['Page detected','Loading the scene…','Keep the full page in view.'],
 tracked:['Page detected','','Keep the page in view'],
  'preview-loading':['Camera off','Loading the scene…','Preparing the animated 3D scene.'],
  preview:['3D preview','','Drag to turn or tilt · scroll or pinch to zoom']
};
let mode='idle', world, targetPromise, session, request=0;
let paused=reduced, popAt=0, yaw=0,pitch=0,zoom=1,frame=0,last=0;
const pointers=new Map();
function state(next, message) {
 mode=next;
 stage.dataset.mode=next;
 const [badge,title,hint]=states[next];
 $('mode-badge').querySelector('b').textContent=['tracked','scene-loading'].includes(next)?`Page ${chapter.label} detected`:badge;
 $('status').textContent=message?.[0]??(title||chapter.title);
 $('instruction').textContent=message?.[1]??(next==='tracked'?chapter.trackedHint:hint);
 overlayHost.hidden=!['preview','tracked'].includes(next);
 dockHost.hidden=overlayHost.hidden||!world?.interactions.hasControls;
 const active=!!session;
 document.body.classList.toggle('live-scan',active);
 $('chapter-label').textContent=['preview','preview-loading','tracked','scene-loading'].includes(next)?`CHAPTER ${chapter.label}`:'AUTO SCAN';
 scan.querySelector('span').textContent=active?'Stop camera':'Start camera';
 preview.querySelector('span').textContent=next==='preview'?'Close preview':'3D preview';
 preview.disabled=next==='preview-loading';
 const visible=next==='tracked'||next==='preview';
 tools.hidden=!visible;
 stage.tabIndex=visible?0:-1;
 stage.setAttribute('aria-label',visible?'3D diorama. Use arrow keys to turn or tilt and plus or minus to zoom.':'Camera viewfinder');
 const caption=$('live-caption');
 caption.hidden=!visible && !(next==='scanning'&&!!world);
 const canPause=!!world?.actions.length;
 caption.textContent=canPause?`${chapter.animation} · ${visible&&!paused?'playing':'paused'}`:chapter.animation;
 const btn=$('pause'), label=`${paused?'Play':'Pause'} ${chapter.animation.toLowerCase()} animation`;
 btn.hidden=!canPause;
 btn.setAttribute('aria-label',label);btn.title=label;
 btn.querySelector('use').setAttribute('href',paused?'#play':'#icon-pause');
}
function addLight(scene) {
 scene.add(new THREE.HemisphereLight(0xfff6de,0x85937a,1.68));
 const sun=new THREE.DirectionalLight(0xfff0d2,2.1);sun.position.set(-2,2.7,3);scene.add(sun);
 const fill=new THREE.DirectionalLight(0xe0f1e2,.65);fill.position.set(1.5,1,-2);scene.add(fill);
}
const installers={4:()=>import('./page4.mjs?v=portrait1').then(m=>m.installPage4),6:()=>import('./page6.mjs').then(m=>m.installPage6),8:()=>import('./page8.mjs?v=greeting2').then(m=>m.installPage8)};
function setupWorld(gltf, entry, install) {
 const {scene:asset, animations}=gltf;
 const {aspect,clips}=entry;
 if(clips?.some(n=>!animations.some(a=>a.name===n)))throw new Error(`Missing an animation for Page ${entry.label}.`);
 const env=asset.getObjectByName(entry.number===11?'A5_Continuous_Terrain_Base':'Environment');
 if(!env)throw new Error(`Page ${entry.label} is missing its terrain.`);
 asset.updateMatrixWorld(true); // Include the Blender A5 root scale before measuring the mesh.
 const box=new THREE.Box3().setFromObject(env);
 asset.traverse(o=>{if(o.isMesh && o.name.startsWith('A5_')) box.union(new THREE.Box3().setFromObject(o));});
 const normalized=fit(box,aspect);

 const scene=new THREE.Scene(), placement=new THREE.Group(), rise=new THREE.Group(), user=new THREE.Group(), size=new THREE.Group(), center=new THREE.Group();
 scene.add(placement);placement.add(rise);rise.add(user);user.add(size);size.add(center);center.add(asset);addLight(scene);
 size.scale.setScalar(normalized.scale);center.position.fromArray(normalized.center);
 // A full-page footing covers narrow terrain edges without deforming the models.
 const {width,depth,thickness}=pageFootprint(aspect);
 const soil=new THREE.MeshStandardMaterial({color:0x56402c,roughness:1});
 const grass=new THREE.MeshStandardMaterial({color:0x698553,roughness:1});
 const footing=new THREE.Mesh(new THREE.BoxGeometry(width,thickness,depth),[soil,soil,grass,soil,soil,soil]);
 footing.position.y=-thickness/2;
 center.position.y+=.001;
 user.add(footing);
 const overlay=document.createElement('div'); overlay.className='story-effect-layer';
 const dock=document.createElement('div');dock.className='story-control-dock';
 const root=new THREE.Group(); center.add(root);
 const interactions=createInteractions({entry,asset,root,overlay,dock,animations,install,sceneLights:scene.children.filter(node=>node.isLight),finish:()=>{if(world?.entry===entry && interactive()&&!finale.open)finale.showModal();}});
 const mixer=new THREE.AnimationMixer(asset);
 const actions=animations.filter(a=>!clips||clips.includes(a.name)).map(a=>mixer.clipAction(a).play());
 // Page plane is in XZ in preview; the Z-positive edge is closest to the reader.
 const pageTexture=new THREE.TextureLoader().load(entry.image);pageTexture.colorSpace=THREE.SRGBColorSpace;
 const book=new THREE.Mesh(new THREE.PlaneGeometry(1.038,aspect+.052),new THREE.MeshBasicMaterial({map:pageTexture,color:0xd3d5b7}));
 book.rotation.x=-Math.PI/2;book.position.y=-.025;scene.add(book);
 const pc=new THREE.OrthographicCamera(-1,1,1,-1,.01,30);
 pc.position.fromArray(entry.view);pc.lookAt(0,.3,0);
 return {entry,asset,scene,placement,rise,user,mixer,actions,book,pc,arCam,interactions,overlay,dock,footing,
  depth,width,height:(box.max.y-box.min.y)*normalized.scale,anchor:new THREE.Matrix4()};
}
function getRenderer(){
 if(renderer)return renderer;
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.setClearColor(0,0);
 renderer.domElement.setAttribute('aria-hidden','true');surface.appendChild(renderer.domElement);
 return renderer;
}
function model(entry) {
 if(!models.has(entry.index)){
  const draco=new DRACOLoader().setDecoderPath('./vendor/draco/').setWorkerLimit(2);
  const promise=Promise.all([new GLTFLoader().setDRACOLoader(draco).loadAsync(entry.model),installers[entry.number]?.()])
   .then(([gltf,install])=>setupWorld(gltf,entry,install)).catch(e=>{if(models.get(entry.index)===promise)models.delete(entry.index);throw e;}).finally(()=>draco.dispose());
  models.set(entry.index,promise);
 }
 return models.get(entry.index);
}
function releaseWorld(w){
 w.interactions.dispose();
 w.mixer.stopAllAction();w.mixer.uncacheRoot(w.asset);
 const geometries=new Set(),materials=new Set(),textures=new Set();
 w.scene.traverse(node=>{
  if(node.geometry)geometries.add(node.geometry);
  if(node.isSkinnedMesh)node.skeleton.dispose();
  for(const mat of [].concat(node.material??[]))materials.add(mat);
 });
 for(const mat of materials){for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);mat.dispose();}
 for(const geo of geometries)geo.dispose();
 for(const tex of textures){tex.dispose();tex.source.data?.close?.();}
}
function activate(w){
 getRenderer().domElement.style.visibility='visible';
 world=w;overlayHost.replaceChildren(w.overlay);dockHost.replaceChildren(w.dock);w.interactions.reset();resize();restart();
 // Keep a short backtrack cache instead of retaining twelve complete scenes on a phone.
 const active=models.get(w.entry.index);
 models.delete(w.entry.index);models.set(w.entry.index,active);
 for(const [index,load] of models){
  if(models.size<=2)break;
  models.delete(index);load.then(stale=>{if(stale!==world)releaseWorld(stale);},()=>{});
 }
}
function hideModel(){
 if(finale.open)finale.close();
 if(world)world.interactions.reset();
 overlayHost.replaceChildren();dockHost.replaceChildren();dockHost.hidden=true;
 if(renderer){renderer.clear();renderer.domElement.style.visibility='hidden';}
}
function targets(){
 return targetPromise??=(fetch('./assets/full-book.mind').then(r=>{
  if(!r.ok)throw Error('The storybook tracking file could not load.');return r.arrayBuffer();
 }).catch(e=>{targetPromise=null;throw e;}));
}
function resize(){
 const w=surface.clientWidth,h=surface.clientHeight;if(!w||!h)return;
 const ratio=w/h, half=Math.max(1.06,.96/ratio);
 if(world){Object.assign(world.pc,{left:-half*ratio,right:half*ratio,top:half,bottom:-half});world.pc.updateProjectionMatrix();}
 renderer?.setSize(w,h,false);
 session?.tracker?.resize(w,h);
}
new ResizeObserver(resize).observe(surface);
const upright=new THREE.Matrix4().makeRotationX(Math.PI/2);
function tick(now){
 frame=0;if(!world||!['preview','tracked','scanning','preparing'].includes(mode))return;
 frame=requestAnimationFrame(tick);
 const w=world, dt=Math.min((now-(last||now))/1000,.25);last=now;
 const active=mode==='tracked'||mode==='preview';
 const isPreview=mode==='preview';
 w.book.visible=isPreview;w.placement.visible=active;
 w.placement.matrixAutoUpdate=false;
 if(isPreview){w.placement.matrix.identity();}
 else w.placement.matrix.copy(w.anchor).multiply(upright);
 w.placement.matrixWorldNeedsUpdate=true;
 const k=active?(reduced?1:ease((now-popAt)/620)):0;
 const {yaw:facing,pitch:theta}=pageOrientation(yaw,pitch);
 // Grow vertically out of the page without shrinking or twisting its footprint.
 w.rise.rotation.x=theta;
 w.rise.scale.set(1,1,1);
 const span=groundSpan(w.width,w.depth,facing)*zoom;
 w.rise.position.y=liftTilt(theta,span,0);
 w.user.rotation.y=facing;w.user.scale.set(zoom,zoom*(.04+.96*k),zoom);
 if(active){w.interactions.beforeUpdate();if(!paused)w.mixer.update(dt);}
 const camera=isPreview?w.pc:w.arCam;
 if(active){w.scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);w.interactions.update(dt,camera);}
 renderer.render(w.scene,camera);
}
function render(){if(!frame){last=0;frame=requestAnimationFrame(tick);}}
function restart(){popAt=performance.now();world?.mixer.setTime(0);}
function reset(){yaw=pitch=0;zoom=1;}
function stopSession(){
 request++;
 if(session){
  session.tracker?.stop();
  session.stream?.getTracks().forEach(t=>t.stop());
  session.video.pause();
  session.video.srcObject=null;
  session.video.remove();
  session=null;
 }
 if(frame){cancelAnimationFrame(frame);frame=0;}last=0;
 hideModel();world=null;
 pointers.clear();stage.classList.remove('dragging');
}
function cameraError(e){
 if(e?.name==='NotAllowedError'||e?.name==='SecurityError')return ['Camera permission blocked','Allow camera access in your browser settings, then retry.'];
 if(e?.name==='NotFoundError'||e?.name==='DevicesNotFoundError')return ['No camera found','Connect a camera or use 3D preview.'];
 if(e?.message==='Scanner files could not load')return ['Scanner files could not load','Check your connection, then tap Start camera to retry.'];
 if(e?.name==='CameraPlaybackTimeout')return ['Camera video did not start','Tap Start camera to try again.'];
 if(e?.name==='NotReadableError')return ['Camera unavailable','Close other apps using your camera and try again.'];
 return ['Could not start AR','Try again or open 3D preview.'];
}
async function startCamera(){
 stopSession();reset();
 if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){state('idle',['Camera needs a secure address','Open this site over HTTPS on a phone, or use localhost on this computer.']);return;}
 const id=request;
 const video=document.createElement('video');
 video.muted=video.defaultMuted=true;
 video.playsInline=true;
 session={video};surface.prepend(video);state('starting');
 let timeout=setTimeout(()=>{
  if(id===request)state('starting',['Still opening the camera…','Your browser is waiting for the camera. You can stop and try again.']);
 },5000);
 try {
  const capture=navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:640},height:{ideal:480}}});
  // Download the recognition data while the phone starts the rear camera.
  const pendingTargets=targets();
  pendingTargets.catch(()=>{}); // A download error is handled once the camera opens.
  const stream=await capture;
  clearTimeout(timeout);
  if(id!==request){stream.getTracks().forEach(t=>t.stop());return;}
  session.stream=stream;
  for(const t of stream.getVideoTracks())t.addEventListener('ended',()=>{if(id===request){stopSession();state('idle',['Camera disconnected','Reconnect the camera or try 3D preview.']);}},{once:true});
  state('camera-video');
  video.srcObject=stream;
  await Promise.race([video.play(),new Promise((_,reject)=>{
   timeout=setTimeout(()=>reject(new DOMException('Camera video did not start','CameraPlaybackTimeout')),12000);
  })]);
  clearTimeout(timeout);
  if(id!==request)return;
  if(!video.videoWidth||!video.videoHeight)throw Error('No camera dimensions');
  state('preparing');
  let bytes, startTracking;
  try {
   [bytes,{startTracking}]=await Promise.all([pendingTargets,import('./tracker.mjs')]);
  } catch(error) {
   if(id!==request)return;
   throw new Error('Scanner files could not load', {cause:error});
  }
  if(id!==request)return;
  const current=session;
  current.pose=null;current.loadToken=0;
  current.tracker=startTracking({video,bytes,camera:arCam,expectedDimensions:chapters.map(c=>c.targetSize),onPose(index,matrix){
   if(id!==request)return;
   const old=current.pose;
   current.pose=choosePose(old,index,matrix);
   if(current.pose===old)return;
   if(old?.index===current.pose?.index){
    if(mode==='tracked')world.anchor.copy(current.pose.matrix);
    return;
   }
   const token=++current.loadToken;
   hideModel();
   if(!current.pose){reset();state('scanning');return;}
   const entry=chapterFor(current.pose.index);
   if(!world||world.entry.index!==entry.index)reset();
   chapter=entry;state('scene-loading');
   model(entry).then(w=>{
    if(id!==request||token!==current.loadToken)return;
    activate(w);w.anchor.copy(current.pose.matrix);state('tracked');render();
   }).catch(e=>{
    if(id!==request||token!==current.loadToken)return;
    console.warn('Storybook scene:',e);state('scanning',['Could not load this scene','Move the page out of view, then try again.']);
   });
  }});
  resize();state('scanning');
 } catch(e){if(id===request){console.warn('Storybook camera:',e);stopSession();state('idle',cameraError(e));}}
 finally {clearTimeout(timeout);}
}
async function showPreview(){
 stopSession();reset();const id=request;state('preview-loading');
 try{
  const w=await model(chapter);if(id!==request)return;
  activate(w);state('preview');render();
 }catch(e){if(id===request){console.warn('Storybook preview:',e);stopSession();state('idle',['Could not load the 3D scene','Check that WebGL is enabled and the project is served from its web folder.']);}}
}
function interactive(){return mode==='tracked'||mode==='preview';}
function handleDrag(){if(!interactive())return;pointers.clear();stage.classList.remove('dragging');}
scan.addEventListener('click',()=>session?(stopSession(),state('idle')):startCamera());
preview.addEventListener('click',()=>mode==='preview'?(stopSession(),state('idle')):showPreview());
$('play-again').addEventListener('click',()=>{finale.close();world?.interactions.reset();restart();stage.focus();});
 $('pause').addEventListener('click',()=>{paused=!paused;state(mode);});
$('reset').addEventListener('click',()=>{reset();handleDrag();});
$('help-open').addEventListener('click',()=>guide.showModal());
$('help-close').addEventListener('click',()=>guide.close());
guide.addEventListener('click',e=>{if(e.target===guide){const r=guide.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)guide.close();}});
window.addEventListener('pagehide',()=>{stopSession();state('idle');});
const gap=()=>{const [a,b]=pointers.values();return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;};
let touchAction=null;
stage.addEventListener('pointerdown',e=>{
 if(!interactive()||e.button!==0||e.target.closest('button'))return;
 touchAction=pointers.size?null:{id:e.pointerId,x:e.clientX,y:e.clientY,drag:false};
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.setPointerCapture(e.pointerId);stage.classList.add('dragging');
});
stage.addEventListener('pointermove',e=>{
 const p=pointers.get(e.pointerId);if(!interactive()||!p)return;
 if(touchAction&&!touchAction.drag){
  if(Math.hypot(e.clientX-touchAction.x,e.clientY-touchAction.y)<7)return;
  touchAction.drag=true;
 }
 const previous=gap();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(previous>0){const next=gap();if(next>0)zoom=zoomBy(zoom,-Math.log(next/previous)/.0013);return;}
 yaw+=(e.clientX-p.x)*.009;
 pitch=pitchBy(pitch,e.clientY-p.y);
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,e=>{
 const tap=touchAction?.id===e.pointerId ? touchAction : null;
 if(tap)touchAction=null;
 pointers.delete(e.pointerId);if(!pointers.size)stage.classList.remove('dragging');
 if(event==='pointerup'&&tap&&!tap.drag&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)<8&&interactive()&&world){
  world.interactions.tap(e.clientX,e.clientY,surface,mode==='preview'?world.pc:world.arCam);
 }
});
stage.addEventListener('wheel',e=>{if(!interactive())return;e.preventDefault();zoom=zoomBy(zoom,e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?stage.clientHeight:1));},{passive:false});
stage.addEventListener('keydown',e=>{
 if(!interactive())return;
 if(e.key==='ArrowLeft')yaw-=.16;else if(e.key==='ArrowRight')yaw+=.16;
 else if(e.key==='ArrowUp')pitch=pitchBy(pitch,-15);else if(e.key==='ArrowDown')pitch=pitchBy(pitch,15);
 else if(e.key==='+'||e.key==='=')zoom=zoomBy(zoom,-75);else if(e.key==='-')zoom=zoomBy(zoom,75);else return;e.preventDefault();
});
// Read-only diagnostics for confirming exported motion and target placement.
if(params.has('qa'))window.storybookTest=()=>({mode,page:chapter.number,scene:world?.entry.number,paused,yaw,pitch,zoom,angle:world?.rise.rotation.x,clips:world?.actions.map(a=>({name:a.getClip().name,time:a.time,duration:a.getClip().duration})),footprint:world?[world.width,world.depth,world.height]:null,projection:arCam.projectionMatrix.elements,anchor:world?.anchor.elements,facing:world?.user.rotation.y,fx:world?.interactions.snapshot(),triangles:renderer?.info.render.triangles});
state('idle');
if(params.get('preview')==='1')showPreview();
