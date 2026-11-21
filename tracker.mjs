import {Matrix4, Quaternion, Vector3} from 'three';
import {Controller} from './vendor/mindar-image.prod.js';

// The tracker processes the camera on-device. The display crops the video and its
// projection by exactly the same amount, so the page anchor doesn't slide.
export function startTracking({video, bytes, camera, expectedDimensions, onPose}) {
 const width=video.videoWidth, height=video.videoHeight;
 // MindAR draws using the HTML width/height attributes, not videoWidth/videoHeight.
 video.width=width; video.height=height;
 let stopping=false, disposed=false;
 function dispose() {
  if(disposed)return;
  disposed=true;
  clearTimeout(cleanup);
  tracker.dispose();
  tracker.worker?.terminate();
 }
 let cleanup;
 const tracker=new Controller({inputWidth:width,inputHeight:height,maxTrack:1,
  warmupTolerance:2,missTolerance:5,filterMinCF:.001,filterBeta:1,
  onUpdate(event) {
   if(stopping){if(event.type==='processDone')dispose();return;}
   if(event.type==='updateMatrix' && centers?.[event.targetIndex]) {
    onPose(event.targetIndex, event.worldMatrix ? new Matrix4().fromArray(event.worldMatrix).multiply(centers[event.targetIndex]) : null);
   }
  }
 });
 let centers, dims;
 try {
  const {dimensions}=tracker.addImageTargetsFromBuffer(bytes);
  if(dimensions.length!==expectedDimensions.length||dimensions.some(([w,h],i)=>w!==expectedDimensions[i][0]||h!==expectedDimensions[i][1]))throw new Error('Image targets do not match this edition.');
  dims=dimensions;
  centers=dims.map(([w,h])=>new Matrix4().compose(new Vector3(w/2,h/2,0),new Quaternion(),new Vector3(w,w,w)));
  tracker.dummyRun(video);
  tracker.processVideo(video);
 } catch (error) {dispose();throw error;}
 const source=tracker.getProjectionMatrix();
 return {
  dims,
  resize(w,h) {
   if(!w||!h)return;
   const cover=Math.max(w/width,h/height);
   const m=source.slice();
   m[0]*=width*cover/w; m[5]*=height*cover/h;
   camera.projectionMatrix.fromArray(m);
   camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  },
  stop() {
   stopping=true; tracker.stopProcessVideo();
   cleanup=setTimeout(dispose,1500);
  }
 };
}
