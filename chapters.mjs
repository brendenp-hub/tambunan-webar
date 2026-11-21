import { landmarks } from './landmarks.mjs';
import { targetDimensions } from './target-dimensions.mjs';
// Full-book target order is the printed story order.
const contents = [
 [1,['The Land of','Tambunan'],'Tap a deer or wild boar to hear the forest. Tap the river to set it flowing.','Wildlife'],
 [2,['Gombunan','Arrives'],'Follow the settlers through the rainforest.','Journey'],
 [3,['Life on','the Plain'],'Help plant five crops. Tap Plant pumpkin to start.','Farming'],
 [4,['Sharing Makes','Them Strong'],'Tap the standing man in blue to see him turn and wave.','Village gathering'],
 [5,['The Tonsundung','Warriors'],'Watch the scene unfold.','The eastern hills'],
 [6,['Gombunan’s','Last Stand'],'Watch the leaves sway in the wind.','Quiet wind'],
 [7,['Remembering','Gombunan'],'Tap the cloud to hear Gombunan’s message. Tap the elders to raise the village’s name.','Remembrance'],
 [8,['A New People','Arrive'],'Tap Tamasin at the front to make him wave.','Arrival'],
 [9,['Friends,','Not Enemies'],'Tap the campfire to put it out or light it again, or tap Tamasin to hear what he tells the elders.','Evening council'],
 [10,['Standing','Together'],'Watch the scene unfold.','Standing together'],
 [11,['The Great','Feast'],'Watch the village celebration.','Feast'],
 [12,['The Birth of','Tambunan'],'Tap the gate sign to join two names and celebrate the birth of Tambunan.','The village gathers']
];
export const chapters=contents.map(([number,heading,description,animation],index)=>{
 const label=String(number).padStart(2,'0'), view=landmarks[number]?.view??(number===4?[.541675,-.541675,.642788]:null);
 const targetSize=targetDimensions[number];
 const clips=number===2?['Walker_Backpack_walk','Walker_Blue_Staff_walk','Walker_Sling_Bag_walk']:[1,3,4,7,9,12].includes(number)?['Animation']:null;
 return {index,number,heading,title:heading.join(' '),description,animation,clips,landmarks:landmarks[number],targetSize,aspect:targetSize[1]/targetSize[0],
  trackedHint: number===4?'Tap the man in blue or use Wave below.':number===6?'Watch the leaves sway · keep the page in view.':number===8?'Tap Tamasin or use Wave below.':[1,3,7,9,12].includes(number)?'Tap the scene or use the controls below.':'Keep the page in view to watch the scene.',
  view:view?[5*view[0],5*view[2]+1.15,-5*view[1]]:[3.6,2.45,2.6],
  backdrop:'forest.webp',
  model:`./assets/page-${label}.glb${number===9?'?v=campfire2':number===8?'?v=greeting2':number===4?'?v=portrait1':[2,3,7].includes(number)?'?v=textures1':''}`,image:`./assets/page-${label}.png`,pdf:`./assets/page_${label}.pdf`,label};
});
export const chapterFor=index=>chapters[index]??null;
export function choosePose(current,index,matrix){
 if(!chapterFor(index))return current;
 if(matrix)return {index,matrix};
 return current?.index===index?null:current;
}
