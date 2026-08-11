import { detentionComplexes, districts, initializeVehicles, resetSessionConfigDefaults, repositioningFailureConfig, sessionConfig, setAvailablePrisons, setVehiclesPerDistrict, simulator, vehicles } from "./data.js";
import { calculateTravelTime, findNearestAvailableVehicle, getDistrictById, getPrisonDistricts, getRouteDistance, getShortestRoute } from "./routing.js";

const STATUS = { AVAILABLE:"AVAILABLE", TO_INCIDENT:"TO_INCIDENT", TO_PRISON:"TO_PRISON", BUSY:"BUSY", RETURNING:"RETURNING", REPOSITIONING:"REPOSITIONING" };
const STEPS = { INCIDENT:"INCIDENT", PRISON:"PRISON", TRAVEL_TIME:"TRAVEL_TIME", DISPATCH:"DISPATCH" };
const DRIVE_MS_PER_EDGE = 1400;
export const MULTI_UNIT_TWO_UNIT_CHANCE = 0.80;
export function determineRequiredUnits(random=Math.random){
 if(random()*100>=sessionConfig.multiUnitIncidentPercentage)return 1;
 return random()<MULTI_UNIT_TWO_UNIT_CHANCE?2:3;
}
export const INCIDENT_MARGIN = 38;
export const INCIDENT_MIN_DISTANCE = 45;
export function getRandomIncidentDelaySeconds(){
 const min=Math.max(1,Math.min(60,Number(sessionConfig.autoplayMinDelaySeconds)||1));
 const max=Math.max(min,Math.min(60,Number(sessionConfig.autoplayMaxDelaySeconds)||min));
 return Math.floor(Math.random()*(max-min+1))+min;
}
export function dedupePathPoints(points,epsilon=1e-6){
 return points.filter((point,index,path)=>index===0||Math.abs(point.x-path[index-1].x)>=epsilon||Math.abs(point.y-path[index-1].y)>=epsilon);
}
export const INCIDENT_SPAWN_POLYGON = [
 {x:95,y:365},{x:155,y:185},{x:285,y:125},{x:455,y:120},{x:610,y:78},
 {x:680,y:275},{x:845,y:235},{x:1020,y:205},{x:1025,y:365},{x:875,y:405},
 {x:745,y:545},{x:585,y:570},{x:390,y:615},{x:215,y:535}
];

export function pointInPolygon(point, polygon=INCIDENT_SPAWN_POLYGON) {
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if(((a.y>point.y)!==(b.y>point.y))&&(point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x))inside=!inside;
 }
 return inside;
}

function distanceToPolygonEdge(point,polygon=INCIDENT_SPAWN_POLYGON){return Math.min(...polygon.map((start,index)=>{const end=polygon[(index+1)%polygon.length],dx=end.x-start.x,dy=end.y-start.y,t=Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.y-start.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(point.x-(start.x+t*dx),point.y-(start.y+t*dy));}));}

export class Engine {
 constructor(){ this.activeDispatches=new Map(); this.activeRepositions=new Map(); this.sequence=0; this.repositionSequence=0; }
 get step(){return simulator.inputCycleState.step;}
 setStep(step){simulator.inputCycleState.step=step;}
 resetInputCycle(){
  this.removeRoute("vehicle-selection-preview");
  Object.assign(simulator.inputCycleState,{step:STEPS.INCIDENT,incidentId:null,prisonId:null,travelTime:null,selectedVehicleId:null,selectedVehicleIds:[]});
  Object.assign(simulator.vehicleSelection,{active:false,incidentId:null,selectedVehicleId:null,selectedVehicleIds:[],confirming:false});
  Object.assign(simulator,{activeIncident:null,selectedPrison:null,travelTime:null,selectedVehicleId:null,selectedVehicleIds:[]});
 }
 createIncident(options={}) {
  if(simulator.gameOver) return this.result(false,"[FOUT] De oefening is geblokkeerd.");
  const isAutoplay=sessionConfig.operationMode==="autoplay";
  const shouldAutoDispatch=isAutoplay&&options.autoplayGenerated===true;
  if(!shouldAutoDispatch&&this.step!==STEPS.INCIDENT)return this.result(false,"[FOUT] Maak eerst de huidige knopcyclus af.");
  const position=this.createIncidentPosition(),district=this.nearestDistrict(position),requiredUnits=options.requiredUnits??determineRequiredUnits();
  const incident={id:`INC-${Date.now()}-${++this.sequence}`,district:district.id,districtId:district.id,x:position.x,y:position.y,status:"OPEN",createdAt:performance.now(),prisonId:null,travelTime:null,requiredUnits,assignedVehicleIds:[],arrivedVehicleIds:[],transportVehicleId:null,vehicleId:null};
  simulator.incidents.push(incident); simulator.activeIncident=incident;Object.assign(simulator.inputCycleState,{incidentId:incident.id,prisonId:null,travelTime:null,selectedVehicleId:null,selectedVehicleIds:[]});
  let dispatchResult=null;if(shouldAutoDispatch){this.prepareIncident(incident);dispatchResult=this.assignIncident(incident);this.resetInputCycle();}else this.setStep(STEPS.PRISON);
  const description=requiredUnits>1?`Groter incident in ${district.name} — ${requiredUnits} eenheden nodig.`:`Nieuwe ${shouldAutoDispatch?"autoplay-":""}melding in ${district.name}.`;
  return this.result(true,`[MELDING] ${description}`,{district,incident,events:dispatchResult?.events||[],followup:dispatchResult?.message});
 }
 prepareIncident(incident){
  const prisons=getPrisonDistricts(); if(!prisons.length) return;
  const ranked=prisons.map(prison=>({prison,route:getShortestRoute(incident.district,prison.id)})).filter(x=>x.route.length).sort((a,b)=>getRouteDistance(a.route)-getRouteDistance(b.route));
  const choice=ranked[0]; incident.prisonId=choice.prison.id; incident.routeToPrison=choice.route; incident.travelTime=calculateTravelTime(choice.route);
 }
 getInputCycleIncident(requiredStatus="OPEN"){
  const id=simulator.inputCycleState.incidentId;
  return simulator.incidents.find(incident=>incident.id===id&&(!requiredStatus||(requiredStatus==="OPEN"?["OPEN","PARTIALLY_ASSIGNED"].includes(incident.status):incident.status===requiredStatus)))||null;
 }
 selectPrison(){ if(this.step!==STEPS.PRISON)return this.result(false,"[FOUT] Plaats eerst een melding.");const i=this.requireInputIncident("PRISON");this.prepareIncident(i);Object.assign(simulator.inputCycleState,{prisonId:i.prisonId,travelTime:null});simulator.selectedPrison=i.prisonId;this.setStep(STEPS.TRAVEL_TIME);return this.result(true,`[CEL] ${getDistrictById(i.prisonId)?.name} geselecteerd.`); }
 calculateTravelTime(){
  if(this.step!==STEPS.TRAVEL_TIME)return this.result(false,"[FOUT] Selecteer eerst een cel.");
  const i=this.requireInputIncident("TRAVEL_TIME");simulator.inputCycleState.travelTime=i.travelTime;simulator.travelTime=i.travelTime;this.setStep(STEPS.DISPATCH);
  if(sessionConfig.operationMode==="manualVehicle")this.startVehicleSelection();
  return this.result(true,`[REISTIJD] Geschatte reistijd: ${i.travelTime} seconden.${sessionConfig.operationMode==="manualVehicle"?" Kies een beschikbaar voertuig op de kaart.":""}`);
 }
 inputSnapshot(){return{step:this.step,inputCycleState:{...simulator.inputCycleState},incidents:simulator.incidents.map(({id,status,prisonId,travelTime})=>({id,status,prisonId,travelTime})),activeDispatches:[...this.activeDispatches.keys()],activeRepositions:[...this.activeRepositions.keys()],availableVehicles:vehicles.filter(v=>v.status===STATUS.AVAILABLE).length};}
 requireInputIncident(stage){const state=simulator.inputCycleState,incident=simulator.incidents.find(item=>item.id===state.incidentId);let valid=!!state.incidentId&&!!incident;if(stage==="PRISON"||stage==="DISPATCH")valid&&=["OPEN","PARTIALLY_ASSIGNED"].includes(incident.status);if(stage==="TRAVEL_TIME"||stage==="DISPATCH")valid&&=!!state.prisonId&&incident.prisonId===state.prisonId;if(stage==="DISPATCH")valid&&=Number.isFinite(state.travelTime);if(!valid){const error=new Error(`[INVARIANT ${stage}] Ongeldige automatische invoercyclus`);console.error(error.message,this.inputSnapshot());throw error;}return incident;}
 recoverInvalidInputCycle(reason){console.error("input cycle failed",{reason,inputCycleState:{...simulator.inputCycleState}});this.resetInputCycle();return this.result(false,`[FOUT] ${reason}. De invoercyclus is hersteld.`);}
 startVehicleSelection(){
  if(sessionConfig.operationMode!=="manualVehicle"||simulator.gameOver||this.step!==STEPS.DISPATCH)return this.result(false,"[FOUT] Handmatige voertuigkeuze is niet beschikbaar.");
  const incident=this.getInputCycleIncident();if(!incident)return this.result(false,"[FOUT] Er is geen open melding.");
  Object.assign(simulator.vehicleSelection,{active:true,incidentId:incident.id,selectedVehicleId:null,selectedVehicleIds:[],confirming:false});Object.assign(simulator,{selectedVehicleId:null,selectedVehicleIds:[],activeIncident:incident});Object.assign(simulator.inputCycleState,{incidentId:incident.id,selectedVehicleId:null,selectedVehicleIds:[]});
  return this.result(true,`[SELECTIE] Kies ${incident.requiredUnits} beschikbare voertuigen op de kaart.`);
 }
 selectIncident(incidentId){
  if(sessionConfig.operationMode!=="manualVehicle"||simulator.gameOver)return this.result(false,"[FOUT] Meldingselectie is niet beschikbaar.");
  const incident=simulator.incidents.find(i=>i.id===incidentId&&["OPEN","PARTIALLY_ASSIGNED"].includes(i.status));if(!incident)return this.result(false,"[FOUT] Deze melding is niet meer open.");
  simulator.activeIncident=incident;simulator.inputCycleState.incidentId=incident.id;if(simulator.vehicleSelection.active)Object.assign(simulator.vehicleSelection,{incidentId:incident.id,selectedVehicleId:null,selectedVehicleIds:[]});Object.assign(simulator,{selectedVehicleId:null,selectedVehicleIds:[]});return this.result(true,`[SELECTIE] Melding ${getDistrictById(incident.district)?.name} geselecteerd.`);
 }
 selectVehicle(vehicleId){
  const selection=simulator.vehicleSelection;if(sessionConfig.operationMode!=="manualVehicle"||!selection.active||simulator.gameOver)return this.result(false,"[FOUT] Bereken eerst de reistijd.");
  const vehicle=vehicles.find(v=>v.id===vehicleId),incident=simulator.incidents.find(i=>i.id===selection.incidentId&&["OPEN","PARTIALLY_ASSIGNED"].includes(i.status));if(!vehicle||vehicle.status!==STATUS.AVAILABLE||vehicle.incident)return this.result(false,`[FOUT] ${vehicleId} is niet inzetbaar.`);if(!incident)return this.result(false,"[FOUT] De gekozen melding is niet meer open.");
  const ids=selection.selectedVehicleIds||[];const index=ids.indexOf(vehicle.id);if(index>=0)ids.splice(index,1);else if(ids.length<incident.requiredUnits)ids.push(vehicle.id);else if(incident.requiredUnits===1)ids.splice(0,1,vehicle.id);else return this.result(false,`[SELECTIE] Er zijn al ${incident.requiredUnits} voertuigen geselecteerd.`);
  selection.selectedVehicleId=ids.at(-1)||null;simulator.selectedVehicleId=selection.selectedVehicleId;simulator.selectedVehicleIds=[...ids];simulator.inputCycleState.selectedVehicleId=selection.selectedVehicleId;simulator.inputCycleState.selectedVehicleIds=[...ids];simulator.activeIncident=incident;
  return this.result(true,`[SELECTIE] ${ids.length}/${incident.requiredUnits} voertuigen geselecteerd.`,{selection:{vehicleIds:[...ids]}});
 }
 cancelVehicleSelection(){this.clearVehicleSelection();return this.result(true,"[SELECTIE] Voertuigkeuze geannuleerd.");}
 clearVehicleSelection(){Object.assign(simulator.vehicleSelection,{active:false,incidentId:null,selectedVehicleId:null,selectedVehicleIds:[],confirming:false});Object.assign(simulator.inputCycleState,{selectedVehicleId:null,selectedVehicleIds:[]});Object.assign(simulator,{selectedVehicleId:null,selectedVehicleIds:[]});this.removeRoute("vehicle-selection-preview");}
 confirmManualDispatch(){
  if(sessionConfig.operationMode!=="manualVehicle"||this.step!==STEPS.DISPATCH||simulator.gameOver)return this.result(false,"[FOUT] Handmatige inzet is nu niet mogelijk.");
  const selection=simulator.vehicleSelection,ids=[...(selection.selectedVehicleIds||[])],incident=simulator.incidents.find(i=>i.id===selection.incidentId);
  if(!incident||ids.length<1||ids.length>incident.requiredUnits)return this.result(false,`[FOUT] Selecteer één tot ${incident?.requiredUnits||0} voertuigen.`);
  if(ids.some(id=>{const v=vehicles.find(x=>x.id===id);return !v||v.status!==STATUS.AVAILABLE||v.incident;}))return this.result(false,"[FOUT] Een geselecteerd voertuig is niet meer beschikbaar.");
  selection.confirming=true;const events=[];for(const id of ids){const result=this.startDispatch({incidentId:incident.id,vehicleId:id,prisonId:incident.prisonId});events.push(...(result.events||[]));if(!result.success){selection.confirming=false;return result;}}
  const name=getDistrictById(incident.district)?.name;this.resetInputCycle();events.push(...this.ensureCoverage());return this.result(true,`[DISPATCH] ${ids.join(", ")} handmatig ingezet voor melding ${name} (${incident.assignedVehicleIds.length}/${incident.requiredUnits}).`,{events});
 }
 dispatchVehicle(){
  if(sessionConfig.operationMode!=="autoplay"&&this.step!==STEPS.DISPATCH)return this.result(false,"[FOUT] Bereken eerst de reistijd met knop 3.");
  if(sessionConfig.operationMode==="manualVehicle")return this.result(false,"[FOUT] Kies voertuigen op de kaart.");
  const incident=this.requireInputIncident("DISPATCH"),result=this.assignIncident(incident);this.resetInputCycle();return result;
 }
 assertSuccessfulDispatch(){}
 availableVehiclesByDistance(incident){return vehicles.filter(v=>v.status===STATUS.AVAILABLE&&!v.incident&&!incident.assignedVehicleIds.includes(v.id)).map(vehicle=>({vehicle,distance:getRouteDistance(getShortestRoute(vehicle.district,incident.district))})).sort((a,b)=>a.distance-b.distance).map(x=>x.vehicle);}
 assignIncident(incident,vehicleId=null){
  if(!incident?.prisonId)this.prepareIncident(incident);const needed=incident.requiredUnits-incident.assignedVehicleIds.length,candidates=vehicleId?[vehicles.find(v=>v.id===vehicleId)].filter(Boolean):this.availableVehiclesByDistance(incident).slice(0,needed);const events=[];let assigned=0,firstVehicle=null;
  for(const vehicle of candidates){const result=this.startDispatch({incidentId:incident.id,vehicleId:vehicle.id,prisonId:incident.prisonId});if(result.success){assigned++;firstVehicle??=vehicle;events.push(...(result.events||[]),{type:"log",message:`[DISPATCH] ${vehicle.id} ingezet voor ${getDistrictById(incident.district)?.name} (${incident.assignedVehicleIds.length}/${incident.requiredUnits}).`});}}
  const message=incident.assignedVehicleIds.length<incident.requiredUnits?`[WACHT] ${incident.assignedVehicleIds.length}/${incident.requiredUnits} eenheden onderweg.`:`[DISPATCH] ${incident.requiredUnits}/${incident.requiredUnits} eenheden onderweg.`;if(assigned&&incident.status==="FULLY_ASSIGNED")events.push(...this.ensureCoverage());return this.result(assigned>0,message,{events,vehicle:firstVehicle,district:getDistrictById(incident.district)});
 }
 assignMissingUnits(){
  if(simulator.gameOver)return[];
  const events=[];
  for(const incident of simulator.incidents.filter(item=>item.status==="PARTIALLY_ASSIGNED")){
   if(!vehicles.some(vehicle=>vehicle.status===STATUS.AVAILABLE&&!vehicle.incident))break;
   const result=this.assignIncident(incident);
   if(result.success)events.push({type:"log",message:result.message},...(result.events||[]));
  }
  return events;
 }
 startDispatch({incidentId,vehicleId,prisonId}){
  const incident=simulator.incidents.find(i=>i.id===incidentId),vehicle=vehicles.find(v=>v.id===vehicleId),prison=getPrisonDistricts().find(p=>p.id===prisonId);const fail=reason=>this.result(false,`[FOUT] Dispatch niet gestart: ${reason}.`);
  if(!incident||!["OPEN","PARTIALLY_ASSIGNED"].includes(incident.status))return fail("melding accepteert geen voertuigen");if(!vehicle||vehicle.status!==STATUS.AVAILABLE||vehicle.incident||incident.assignedVehicleIds.includes(vehicle.id))return fail("voertuig is niet beschikbaar");if(!prison)return fail("cellencomplex is niet beschikbaar");
  const id=`DSP-${incident.id}-${vehicle.id}`,routeToIncident=getShortestRoute(vehicle.district,incident.district),routeToPrison=getShortestRoute(incident.district,prison.id);if(!routeToIncident.length||!routeToPrison.length)return fail("route kon niet worden berekend");
  incident.prisonId=prison.id;incident.routeToPrison=routeToPrison;incident.travelTime??=calculateTravelTime(routeToPrison);incident.assignedVehicleIds.push(vehicle.id);incident.vehicleId=incident.assignedVehicleIds[0];incident.transportVehicleId??=vehicle.id;incident.status=incident.assignedVehicleIds.length>=incident.requiredUnits?"FULLY_ASSIGNED":"PARTIALLY_ASSIGNED";vehicle.status=STATUS.TO_INCIDENT;vehicle.incident=incident.id;vehicle.prison=prison.id;
  const origin=vehicle.district,dispatch={id,vehicleId:vehicle.id,incidentId:incident.id,phase:STATUS.TO_INCIDENT,originDistrictId:origin,incidentDistrictId:incident.district,incidentX:incident.x,incidentY:incident.y,prisonDistrictId:prison.id,routeToIncident,routeToPrison,returnRoute:getShortestRoute(incident.district,origin),prisonReturnRoute:getShortestRoute(prison.id,origin),phaseStartTime:performance.now(),busySeconds:incident.travelTime,fromX:vehicle.x,fromY:vehicle.y,toX:incident.x,toY:incident.y};this.activeDispatches.set(id,dispatch);simulator.activeRoutes.push({id:`${id}-to-incident`,route:routeToIncident,type:"dispatch",destination:{x:incident.x,y:incident.y}});return this.result(true,`[DISPATCH] ${vehicle.id} ingezet (${incident.assignedVehicleIds.length}/${incident.requiredUnits}).`,{vehicle,district:getDistrictById(incident.district),events:[]});
 }
 update(now=performance.now()){
  const events=[];
  const autoplay=simulator.autoplayState;if(sessionConfig.operationMode==="autoplay"&&autoplay.running&&!simulator.gameOver&&autoplay.nextIncidentAt!==null&&now>=autoplay.nextIncidentAt){const r=this.createIncident({autoplayGenerated:true});events.push({type:"log",message:r.message});if(r.followup)events.push({type:"log",message:r.followup});events.push(...(r.events||[]));if(!simulator.gameOver)this.scheduleNextIncident(now);}
  for(const d of [...this.activeDispatches.values()]){
   try{events.push(...this.updateDispatch(d,now));}
   catch(error){console.error("Dispatch update failed",d,error);this.cancelCorruptDispatch(d);events.push({type:"log",message:`[FOUT] Dispatch ${d?.id||"onbekend"} is geannuleerd; overige opdrachten gaan door.`});}
  }
  for(const r of [...this.activeRepositions.values()])events.push(...this.updateReposition(r,now));
  events.push(...this.assignMissingUnits());
  if(!simulator.gameOver&&sessionConfig.operationMode==="autoplay"){const waiting=this.oldestOpen();if(waiting&&vehicles.some(v=>v.status===STATUS.AVAILABLE)){const result=this.assignIncident(waiting);events.push({type:"log",message:result.message},...(result.events||[]));}}
  return events;
 }
 updateDispatch(d,now){
  const v=vehicles.find(x=>x.id===d.vehicleId);if(!v)return[];
  if(d.phase===STATUS.BUSY){if((now-d.phaseStartTime)/1000<d.busySeconds)return[];this.phase(d,STATUS.RETURNING,now,d.prisonReturnRoute,getDistrictById(d.originDistrictId));v.status=STATUS.RETURNING;simulator.activeRoutes.push({id:`${d.id}-return`,route:d.prisonReturnRoute,type:"return"});return[{type:"returning",vehicle:v}];}
  if(d.phase==="WAITING_AT_INCIDENT")return[];
  const route=d.phase===STATUS.TO_INCIDENT?d.routeToIncident:d.phase===STATUS.TO_PRISON?d.routeToPrison:d.returnRoute,progress=Math.min(1,(now-d.phaseStartTime)/Math.max(900,getRouteDistance(route)*DRIVE_MS_PER_EDGE));this.move(v,route,progress,d);if(progress<1)return[];
  if(d.phase===STATUS.TO_INCIDENT){
   const incident=simulator.incidents.find(i=>i.id===d.incidentId);this.removeRoute(`${d.id}-to-incident`);v.district=d.incidentDistrictId;if(!incident)return[];if(!incident.arrivedVehicleIds.includes(v.id))incident.arrivedVehicleIds.push(v.id);
   const arrival={type:"log",message:`[AANKOMST] ${incident.arrivedVehicleIds.length}/${incident.requiredUnits} eenheden aanwezig.`};
   if(incident.arrivedVehicleIds.length<incident.requiredUnits){d.phase="WAITING_AT_INCIDENT";v.status=STATUS.TO_INCIDENT;v.x=incident.x;v.y=incident.y;return[arrival];}
   this.handleIncident(incident.id,now);simulator.incidentsHandled++;
   const events=[arrival,{type:"incidentCleared",vehicle:v,incidentId:d.incidentId}];
   for(const related of [...this.activeDispatches.values()].filter(item=>item.incidentId===incident.id)){
    const unit=vehicles.find(item=>item.id===related.vehicleId);if(!unit)continue;
    if(unit.id===incident.transportVehicleId){unit.status=STATUS.TO_PRISON;this.phase(related,STATUS.TO_PRISON,now,related.routeToPrison,getDistrictById(related.prisonDistrictId));simulator.activeRoutes.push({id:`${related.id}-to-prison`,route:related.routeToPrison,type:"dispatch"});events.push({type:"transport",vehicle:unit,district:getDistrictById(related.prisonDistrictId)});
    }else{unit.status=STATUS.RETURNING;this.phase(related,STATUS.RETURNING,now,related.returnRoute,getDistrictById(related.originDistrictId));simulator.activeRoutes.push({id:`${related.id}-return`,route:related.returnRoute,type:"return"});events.push({type:"returning",vehicle:unit});}
   }return events;
  }
  if(d.phase===STATUS.TO_PRISON){v.status=STATUS.BUSY;this.removeRoute(`${d.id}-to-prison`);d.phase=STATUS.BUSY;d.phaseStartTime=now;return[{type:"prisonReached",vehicle:v,seconds:d.busySeconds}];}
  v.status=STATUS.AVAILABLE;v.incident=null;v.prison=null;v.district=d.originDistrictId;this.place(v);this.removeRoute(`${d.id}-return`);this.activeDispatches.delete(d.id);return[{type:"vehicleReturned",vehicle:v},...this.ensureCoverage()];
 }
 updateReposition(r,now){const v=vehicles.find(x=>x.id===r.vehicleId);if(!v)return[];const p=Math.min(1,(now-r.phaseStartTime)/Math.max(900,getRouteDistance(r.route)*DRIVE_MS_PER_EDGE));this.move(v,r.route,p,r);if(p<1)return[];v.district=r.targetDistrictId;v.status=STATUS.AVAILABLE;this.place(v);this.activeRepositions.delete(r.id);this.removeRoute(r.id);return[{type:"repositionComplete",repositionType:r.type,vehicle:v,district:getDistrictById(v.district),origin:getDistrictById(r.originDistrictId)}];}
 ensureCoverage(){if(simulator.gameOver)return[];const events=[];for(const target of districts){if(this.availableCount(target.id)||this.incoming(target.id))continue;const donor=target.neighbours.map(getDistrictById).filter(d=>d&&this.availableCount(d.id)>1).sort((a,b)=>this.availableCount(b.id)-this.availableCount(a.id))[0];if(!donor){events.push(this.triggerRepositioningFailure(target));break;}const v=vehicles.find(x=>x.district===donor.id&&x.status===STATUS.AVAILABLE),route=getShortestRoute(donor.id,target.id),id=`REP-${++this.repositionSequence}`;v.status=STATUS.REPOSITIONING;const r={id,type:"automatic",originDistrictId:donor.id,vehicleId:v.id,targetDistrictId:target.id,route,phaseStartTime:performance.now(),fromX:v.x,fromY:v.y,toX:target.x,toY:target.y};this.activeRepositions.set(id,r);simulator.activeRoutes.push({id,route,type:"reposition"});events.push({type:"repositionStarted",vehicle:v,district:target});}return events;}
 startManualReposition(){
  if(simulator.gameOver)return this.result(false,"[FOUT] Herpositioneren is niet meer mogelijk.");
  if(sessionConfig.operationMode!=="autoplay"&&(this.step!==STEPS.INCIDENT||simulator.vehicleSelection.active))return this.result(false,"[FOUT] Maak eerst de huidige melding af.");
  Object.assign(simulator.manualRepositionState,{phase:"selectVehicle",selectedVehicleId:null,targetDistrictId:null});
  return this.result(true,"[DEKKING] Handmatige herpositioneringsmodus gestart. Kies eerst een beschikbaar voertuig.");
 }
 cancelManualReposition(){this.clearManualReposition();return this.result(true,"[DEKKING] Handmatige herpositionering geannuleerd.");}
 clearManualReposition(){Object.assign(simulator.manualRepositionState,{phase:"idle",selectedVehicleId:null,targetDistrictId:null});this.removeRoute("manual-reposition-preview");}
 handleManualRepositionAction(){return simulator.manualRepositionState.phase==="idle"?this.startManualReposition():simulator.manualRepositionState.phase==="ready"?this.confirmManualReposition():this.result(false,"[DEKKING] Kies eerst een beschikbaar voertuig en een doeldistrict.");}
 selectRepositionVehicle(vehicleId){
  const state=simulator.manualRepositionState,vehicle=vehicles.find(v=>v.id===vehicleId);
  if(state.phase!=="selectVehicle")return this.result(false,"[FOUT] Kies nu geen voertuig.");
  if(!vehicle||vehicle.status!==STATUS.AVAILABLE||vehicle.incident||[...this.activeRepositions.values()].some(r=>r.vehicleId===vehicleId))return this.result(false,`[FOUT] ${vehicleId} is niet beschikbaar.`);
  Object.assign(state,{phase:"selectDistrict",selectedVehicleId:vehicle.id,targetDistrictId:null});this.removeRoute("manual-reposition-preview");
  return this.result(true,`[SELECTIE] ${vehicle.id} geselecteerd voor herpositionering. Kies een doeldistrict.`);
 }
 selectRepositionTarget(targetDistrictId){
  const state=simulator.manualRepositionState,vehicle=vehicles.find(v=>v.id===state.selectedVehicleId),target=getDistrictById(targetDistrictId);
  if(state.phase!=="selectDistrict"||!vehicle)return this.result(false,"[FOUT] Kies eerst een beschikbaar voertuig.");
  if(!target||target.id===vehicle.district)return this.result(false,"[FOUT] Kies een ander doeldistrict.");
  const route=getShortestRoute(vehicle.district,target.id);if(!route.length)return this.result(false,"[FOUT] Er bestaat geen route naar dit district.");
  Object.assign(state,{phase:"ready",targetDistrictId:target.id});this.removeRoute("manual-reposition-preview");simulator.activeRoutes.push({id:"manual-reposition-preview",route,type:"selection-preview"});
  const origin=getDistrictById(vehicle.district),originAfter=this.availableCount(origin.id)-1,targetAfter=this.availableCount(target.id)+1,current=this.calculateCoveragePercentage();
  const during=Math.round(districts.filter(d=>d.id===origin.id?originAfter>0:this.availableCount(d.id)>0||this.incoming(d.id)).length/districts.length*100);
  const after=Math.round(districts.filter(d=>d.id===origin.id?originAfter>0:d.id===target.id?targetAfter>0:this.availableCount(d.id)>0||this.incoming(d.id)).length/districts.length*100);
  return this.result(true,originAfter===0?`[WAARSCHUWING] ${origin.name} heeft tijdens deze verplaatsing geen beschikbaar voertuig meer.`:`[DEKKING] Route naar ${target.name} gereed.`,{repositionPreview:{vehicleId:vehicle.id,origin:origin.name,target:target.name,route:route.map(id=>getDistrictById(id)?.name).join(" → "),originAfter,targetAfter,current,during,after,warning:originAfter===0}});
 }
 confirmManualReposition(){
  const state=simulator.manualRepositionState;
  if(state.phase!=="ready"||simulator.gameOver)return this.result(false,"[FOUT] Herpositioneren is niet meer mogelijk.");
  if(!state.selectedVehicleId||!state.targetDistrictId)return this.result(false,"[FOUT] Kies eerst een voertuig en doeldistrict.");
  const vehicle=vehicles.find(v=>v.id===state.selectedVehicleId),target=getDistrictById(state.targetDistrictId);
  const unavailable=!vehicle||vehicle.status!==STATUS.AVAILABLE||vehicle.incident||[...this.activeDispatches.values()].some(d=>d.vehicleId===state.selectedVehicleId)||[...this.activeRepositions.values()].some(r=>r.vehicleId===state.selectedVehicleId);
  if(unavailable){const vehicleId=vehicle?.id||state.selectedVehicleId;Object.assign(state,{phase:"selectVehicle",selectedVehicleId:null,targetDistrictId:null});this.removeRoute("manual-reposition-preview");return this.result(false,`[WAARSCHUWING] ${vehicleId} is niet meer beschikbaar. Kies opnieuw een voertuig.`);}
  if(!target){Object.assign(state,{phase:"selectDistrict",targetDistrictId:null});this.removeRoute("manual-reposition-preview");return this.result(false,"[WAARSCHUWING] Het doeldistrict is niet meer geldig. Kies opnieuw een doeldistrict.");}
  const route=getShortestRoute(vehicle.district,target.id);if(!route.length||target.id===vehicle.district){Object.assign(state,{phase:"selectDistrict",targetDistrictId:null});this.removeRoute("manual-reposition-preview");return this.result(false,"[WAARSCHUWING] Herpositioneringsroute is niet meer geldig. Kies opnieuw een doeldistrict.");}
  const origin=getDistrictById(vehicle.district),id=`REP-${++this.repositionSequence}`;vehicle.status=STATUS.REPOSITIONING;
  const reposition={id,type:"manual",originDistrictId:origin.id,vehicleId:vehicle.id,targetDistrictId:target.id,route,phaseStartTime:performance.now(),fromX:vehicle.x,fromY:vehicle.y,toX:target.x,toY:target.y};
  this.activeRepositions.set(id,reposition);this.removeRoute("manual-reposition-preview");simulator.activeRoutes.push({id,route,type:"reposition"});this.clearManualReposition();
  return this.result(true,`[HANDMATIGE HERPOSITIONERING] ${vehicle.id} vertrekt van ${origin.name} naar ${target.name}.`,{events:[{type:"manualRepositionStarted",vehicle,district:target,origin},...this.ensureCoverage()]});
 }
 scheduleNextIncident(now=performance.now()){const delay=getRandomIncidentDelaySeconds();Object.assign(simulator.autoplayState,{nextDelaySeconds:delay,nextIncidentAt:now+delay*1000});return delay;}
 toggleAutoplay(){if(sessionConfig.operationMode!=="autoplay"||simulator.gameOver)return this.result(false,"[FOUT] Autoplay is niet actief.");const state=simulator.autoplayState;state.running=!state.running;if(state.running)this.scheduleNextIncident();else Object.assign(state,{nextIncidentAt:null,nextDelaySeconds:null});return this.result(true,`[MODUS] Autoplay ${state.running?"gestart":"gepauzeerd"}. Lopende opdrachten rijden door.`);}
 getControlState(){const blocked=simulator.gameOver,mode=sessionConfig.operationMode,autoplay=mode==="autoplay",manual=mode==="manualVehicle",selecting=simulator.vehicleSelection.active,repositionState=simulator.manualRepositionState,repositioning=repositionState.phase!=="idle";return{incident:!blocked&&!autoplay&&this.step===STEPS.INCIDENT,prison:!blocked&&!autoplay&&this.step===STEPS.PRISON,travelTime:!blocked&&!autoplay&&this.step===STEPS.TRAVEL_TIME,dispatch:!blocked&&mode==="automatic"&&this.step===STEPS.DISPATCH,confirmVehicle:!blocked&&manual&&selecting&&(simulator.vehicleSelection.selectedVehicleIds||[]).length>0&&!simulator.vehicleSelection.confirming,autoplayToggle:!blocked&&autoplay,reset:true,currentStep:this.step,gameOver:simulator.gameOver,mode,autoplayRunning:simulator.autoplayState.running,vehicleSelectionActive:selecting,manualRepositionActive:repositioning,manualRepositionPhase:repositionState.phase,manualRepositionStart:!blocked&&(repositionState.phase==="idle"&&(autoplay||this.step===STEPS.INCIDENT)&&!selecting||repositionState.phase==="ready"),manualRepositionConfirm:!blocked&&repositionState.phase==="ready"};}
 reset(o={}){Object.assign(simulator,{activeIncident:null,selectedPrison:null,travelTime:null,incidentsHandled:0,gameOver:false,failureInspectionMode:false,activeRoute:[],activeRoutes:[],incidentHistory:[],repositioningFailure:null,incidents:[],selectedVehicleId:null,selectedVehicleIds:[],vehicleSelection:{active:false,incidentId:null,selectedVehicleId:null,selectedVehicleIds:[],confirming:false},inputCycleState:{step:STEPS.INCIDENT,incidentId:null,prisonId:null,travelTime:null,selectedVehicleId:null,selectedVehicleIds:[]},manualRepositionState:{phase:"idle",selectedVehicleId:null,targetDistrictId:null},autoplayState:{running:false,nextIncidentAt:null,nextDelaySeconds:null}});if(o.restoreDefaults)resetSessionConfigDefaults();if(o.availablePrisons)setAvailablePrisons(o.availablePrisons);if(o.vehiclesPerDistrict)setVehiclesPerDistrict(o.vehiclesPerDistrict);if(o.operationMode)sessionConfig.operationMode=o.operationMode;if(o.multiUnitIncidentPercentage!==undefined)sessionConfig.multiUnitIncidentPercentage=Math.max(0,Math.min(100,Number(o.multiUnitIncidentPercentage)));if(o.autoplayMinDelaySeconds!==undefined)sessionConfig.autoplayMinDelaySeconds=Math.max(1,Math.min(60,Number(o.autoplayMinDelaySeconds)));if(o.autoplayMaxDelaySeconds!==undefined)sessionConfig.autoplayMaxDelaySeconds=Math.max(sessionConfig.autoplayMinDelaySeconds,Math.min(60,Number(o.autoplayMaxDelaySeconds)));initializeVehicles();this.activeDispatches.clear();this.activeRepositions.clear();return this.result(true,sessionConfig.operationMode==="autoplay"?"[MODUS] Autoplay klaar — druk op Play.":"[RESET] Nieuwe oefening gestart.");}
 triggerRepositioningFailure(d){this.clearVehicleSelection();this.clearManualReposition();simulator.gameOver=true;Object.assign(simulator.autoplayState,{running:false,nextIncidentAt:null,nextDelaySeconds:null});simulator.repositioningFailure={districtName:d.name,coveragePercentage:this.calculateCoveragePercentage(),availableVehicles:vehicles.filter(v=>v.status===STATUS.AVAILABLE).length,title:repositioningFailureConfig.title,explanation:repositioningFailureConfig.explanation};return{type:"repositioningFailure",failure:simulator.repositioningFailure};}
 cancelCorruptDispatch(d){
  const v=vehicles.find(vehicle=>vehicle.id===d?.vehicleId),incident=simulator.incidents.find(item=>item.id===d?.incidentId);
  if(v){v.status=STATUS.AVAILABLE;v.incident=null;v.prison=null;v.district=d.originDistrictId||v.district;if(getDistrictById(v.district))this.place(v);}
  if(incident){incident.assignedVehicleIds=incident.assignedVehicleIds.filter(id=>id!==d.vehicleId);incident.arrivedVehicleIds=incident.arrivedVehicleIds.filter(id=>id!==d.vehicleId);incident.status=incident.assignedVehicleIds.length?"PARTIALLY_ASSIGNED":"OPEN";incident.vehicleId=incident.assignedVehicleIds[0]||null;}
  this.activeDispatches.delete(d?.id);
  [`${d?.id}-to-incident`,`${d?.id}-to-prison`,`${d?.id}-return`].forEach(id=>this.removeRoute(id));
 }
 // Queue policy only: interactive Automatic and Manual Vehicle flows use inputCycleState.incidentId.
 oldestOpen(){return simulator.incidents.filter(i=>["OPEN","PARTIALLY_ASSIGNED"].includes(i.status)).sort((a,b)=>a.createdAt-b.createdAt)[0]||null;} availableCount(id){return vehicles.filter(v=>v.district===id&&v.status===STATUS.AVAILABLE).length;} incoming(id){return[...this.activeRepositions.values()].some(r=>r.targetDistrictId===id);} calculateCoveragePercentage(){return Math.round(districts.filter(d=>this.availableCount(d.id)||this.incoming(d.id)).length/districts.length*100);} projectedCoverage(v){return Math.round(districts.filter(d=>d.id===v.district?this.availableCount(d.id)>1:this.availableCount(d.id)>0).length/districts.length*100);}
 phase(d,s,now,route,target){d.phase=s;d.phaseStartTime=now;d.fromX=vehicles.find(v=>v.id===d.vehicleId).x;d.fromY=vehicles.find(v=>v.id===d.vehicleId).y;d.toX=target.x;d.toY=target.y;}
 move(v,route,p,c){
  if(!v)return;
  if(!c||![c.fromX,c.fromY,c.toX,c.toY].every(Number.isFinite)){console.error("Invalid movement context",c);return;}
  const safeRoute=Array.isArray(route)?route:[];
  const routePoints=safeRoute.map(getDistrictById).filter(Boolean).map(node=>({x:node.x,y:node.y}));
  const start={x:c.fromX,y:c.fromY},destination={x:c.toX,y:c.toY};
  const points=dedupePathPoints([start,...routePoints.slice(1,-1),destination]);
  if(points.length<2){v.x=destination.x;v.y=destination.y;return;}
  const progress=Math.max(0,Math.min(1,Number.isFinite(p)?p:0)),q=progress*(points.length-1),i=Math.min(Math.floor(q),points.length-2),f=q-i,oldX=v.x,oldY=v.y;
  v.x=points[i].x+(points[i+1].x-points[i].x)*f;v.y=points[i].y+(points[i+1].y-points[i].y)*f;
  if(v.x!==oldX||v.y!==oldY)v.angle=Math.atan2(v.y-oldY,v.x-oldX)*180/Math.PI;
 }
 place(v){const d=getDistrictById(v.district);v.x=d.x;v.y=d.y;} removeRoute(id){simulator.activeRoutes=simulator.activeRoutes.filter(r=>r.id!==id);} random(a){return a[Math.floor(Math.random()*a.length)];} result(success,message,data={}){return{success,message,...data};}
 handleIncident(id,handledAt){const index=simulator.incidents.findIndex(i=>i.id===id);if(index<0)return;const incident=simulator.incidents[index];incident.status="HANDLED";incident.handledAt=handledAt;simulator.incidentHistory.push({...incident});if(simulator.activeIncident?.id===id)simulator.activeIncident=null;}
 nearestDistrict(point){return districts.reduce((nearest,district)=>Math.hypot(point.x-district.x,point.y-district.y)<Math.hypot(point.x-nearest.x,point.y-nearest.y)?district:nearest,districts[0]);}
 createIncidentPosition(){const xs=INCIDENT_SPAWN_POLYGON.map(p=>p.x),ys=INCIDENT_SPAWN_POLYGON.map(p=>p.y),bounds={minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)};let best=null,bestDistance=-1,validAttempts=0,totalAttempts=0;while(validAttempts<20&&totalAttempts++<200){const candidate={x:Math.round(bounds.minX+Math.random()*(bounds.maxX-bounds.minX)),y:Math.round(bounds.minY+Math.random()*(bounds.maxY-bounds.minY))};if(!pointInPolygon(candidate)||distanceToPolygonEdge(candidate)<INCIDENT_MARGIN)continue;validAttempts++;const distance=simulator.incidents.length?Math.min(...simulator.incidents.map(i=>Math.hypot(candidate.x-i.x,candidate.y-i.y))):Infinity;if(distance>=INCIDENT_MIN_DISTANCE)return candidate;if(distance>bestDistance){best=candidate;bestDistance=distance;}}return best||{x:550,y:350};}
}
