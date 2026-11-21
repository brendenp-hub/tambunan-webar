const clamp = (x,lo,hi) => Math.max(lo, Math.min(hi,x));
export function fit({min,max},aspect) {
 return {scale:.995*Math.min(1/(max.x-min.x),aspect/(max.z-min.z)),center:[-(max.x+min.x)/2,-min.y,-(max.z+min.z)/2]};
}
export function ease(x) {return 1-(1-clamp(x,0,1))**3;}
export function liftTilt(theta, depth, clearance=.008) {return Math.abs(Math.sin(theta))*depth/2+clearance;}
// The default transform is in page coordinates: no automatic yaw or pitch.
export function pageOrientation(yaw=0,pitch=0) {return {yaw,pitch};}
// A separate flat footing masks exposed print; never stretch the diorama.
export function pageFootprint(aspect) {return {width:1,depth:aspect,thickness:.012};}
export function zoomBy(zoom,delta) {return clamp(zoom*Math.exp(-delta*.0013),.55,1.75);}
export function pitchBy(pitch,deltaY) {return clamp(pitch+deltaY*.006,-.85,.85);}
export function groundSpan(width,depth,yaw) {return Math.abs(width*Math.sin(yaw))+Math.abs(depth*Math.cos(yaw));}
