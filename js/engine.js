import { createEmptyDetentionOccupancy, detentionComplexes, districts, getDetentionComplexPositionById, getDetentionParkingSlot, getTotalDetentionCapacity, getTotalDetentionOccupancy, initializeVehicles, isSpecialVehicle, resetSessionConfigDefaults, repositioningFailureConfig, sessionConfig, setAvailablePrisons, setDetentionCapacity, setHotzoneDistrictIds, setVehiclesPerDistrict, simulator, vehicles } from "./data.js";
import { calculateTravelTime, findNearestAvailableVehicle, getDistrictById, getPrisonDistricts, getRouteDistance, getShortestRoute } from "./routing.js";

const STATUS = { AVAILABLE:"AVAILABLE", TO_INCIDENT:"TO_INCIDENT", ON_SCENE:"ON_SCENE", TO_PRISON:"TO_PRISON", BUSY:"BUSY", RETURNING:"RETURNING", REPOSITIONING:"REPOSITIONING" };
const STEPS = { INCIDENT:"INCIDENT", PRISON:"PRISON", TRAVEL_TIME:"TRAVEL_TIME", DISPATCH:"DISPATCH" };
// Visual pacing only. Operational travel times are calculated separately.
// One visual movement pace for every drive type. This does not affect the
// calculated incident travel time or any operational timer.
export const DRIVE_MS_PER_EDGE = 1800;
export const REPOSITION_TRAINING_DRIVE_MS_PER_EDGE = DRIVE_MS_PER_EDGE;
export const REPOSITION_COOLDOWN_MS = 2000;
export const COVERAGE_GRACE_PERIOD_MS = 2000;
export const MULTI_UNIT_TWO_UNIT_CHANCE = 0.80;
export function determineRequiredUnits(random=Math.random){
 if(random()*100>=sessionConfig.multiUnitIncidentPercentage)return 1;
 return random()<MULTI_UNIT_TWO_UNIT_CHANCE?2:3;
}
export function getRandomOnSceneBusySeconds(random=Math.random){return Math.floor(random()*31)+15;}
export const INCIDENT_MARGIN = 38;
export const INCIDENT_MIN_DISTANCE = 45;
export function getCoverageTargets(activeRepositions=[]){
 const hotzoneIds=new Set(sessionConfig.hotzoneDistrictIds||[]),availableByDistrict=Object.fromEntries(districts.map(d=>[d.id,vehicles.filter(v=>v.district===d.id&&v.status===STATUS.AVAILABLE).length]));
 const incomingByDistrict=Object.fromEntries(districts.map(d=>[d.id,activeRepositions.filter(r=>r.targetDistrictId===d.id).length]));
 const effectiveByDistrict=Object.fromEntries(districts.map(d=>[d.id,availableByDistrict[d.id]+incomingByDistrict[d.id]]));
 const totalAvailable=vehicles.filter(v=>v.status===STATUS.AVAILABLE).length,averageAvailable=districts.length?totalAvailable/districts.length:0,hotzoneMinimum=Math.ceil(averageAvailable);
 const hotzoneValues=districts.filter(d=>hotzoneIds.has(d.id)).map(d=>effectiveByDistrict[d.id]),nonHotzoneValues=districts.filter(d=>!hotzoneIds.has(d.id)).map(d=>effectiveByDistrict[d.id]);
 return{totalAvailable,averageAvailable,hotzoneMinimum,minHotzoneAvailable:hotzoneValues.length?Math.min(...hotzoneValues):null,maxNonHotzoneAvailable:nonHotzoneValues.length?Math.max(...nonHotzoneValues):null,availableByDistrict,incomingByDistrict,effectiveByDistrict};
}
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
 constructor(){ this.activeDispatches=new Map(); this.activeRepositions=new Map(); this.coverageLossStartedAt=new Map(); this.sequence=0; this.repositionSequence=0; this.manualRepositionStarting=false; }
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
  const isAutoplay=["autoplay","repositionTraining"].includes(sessionConfig.operationMode);
  const training=sessionConfig.operationMode==="repositionTraining";
  const shouldAutoDispatch=sessionConfig.operationMode==="autoplay"&&options.autoplayGenerated===true;
  if(!isAutoplay&&this.step!==STEPS.INCIDENT)return this.result(false,"[FOUT] Maak eerst de huidige knopcyclus af.");
  const position=this.createIncidentPosition(),district=this.nearestDistrict(position),requiredUnits=options.requiredUnits??determineRequiredUnits(),type=options.type||((Math.random()*100<sessionConfig.onSceneIncidentPercentage)?"onscene":"detention");
  const incident={id:`INC-${Date.now()}-${++this.sequence}`,type,district:district.id,districtId:district.id,x:position.x,y:position.y,markerVisible:true,status:"OPEN",createdAt:performance.now(),prisonId:null,baseTravelTime:null,travelTime:null,capacityExceeded:false,requiredUnits,assignedVehicleIds:[],arrivedVehicleIds:[],transportVehicleId:null,vehicleId:null,sceneBusyDurationSeconds:type==="onscene"?getRandomOnSceneBusySeconds():null};
  simulator.incidents.push(incident); simulator.activeIncident=incident;Object.assign(simulator.inputCycleState,{incidentId:incident.id,prisonId:null,travelTime:null,selectedVehicleId:null,selectedVehicleIds:[]});
  let dispatchResult=null;if(shouldAutoDispatch){this.prepareIncident(incident);dispatchResult=this.assignIncident(incident);if(Number.isFinite(incident.travelTime))dispatchResult.events.unshift({type:"travelTimeCalculated",incident});this.resetInputCycle();}else if(training){this.prepareIncident(incident);this.setStep(STEPS.INCIDENT);this.activateTrainingIncidentIfUnambiguous();const selected=simulator.incidents.find(i=>i.id===simulator.vehicleSelection.incidentId);simulator.activeIncident=selected||null;}else if(type==="onscene"){this.setStep(STEPS.DISPATCH);if(sessionConfig.operationMode==="manualVehicle")this.startVehicleSelection();}else this.setStep(STEPS.PRISON);
  const description=`${type==="onscene"?"Ter-plaatse melding":"Arrestantenmelding"} in ${district.name}${requiredUnits>1?` — ${requiredUnits} eenheden nodig`:""}.`;
  const waiting=simulator.incidents.filter(i=>["OPEN","PARTIALLY_ASSIGNED"].includes(i.status)).length;
  return this.result(true,`[MELDING] ${description}`,{district,incident,events:dispatchResult?.events||[],followup:dispatchResult?.message||(training?(waiting===1?`[SELECTIE] Kies een voertuig voor ${district.name}.`:`[SELECTIE] ${waiting} meldingen wachten op inzet; klik een melding.`):null)});
 }
 prepareIncident(incident){
  if(incident?.type==="onscene")return;
  const prisons=getPrisonDistricts(); if(!prisons.length) return;
  const ranked=prisons.map(prison=>({prison,route:getShortestRoute(incident.district,prison.id)})).filter(x=>x.route.length).sort((a,b)=>getRouteDistance(a.route)-getRouteDistance(b.route));
  const choice=ranked[0]; incident.prisonId=choice.prison.id; incident.routeToPrison=choice.route; this.setEffectiveTravelTime(incident,choice.route);
 }
 setEffectiveTravelTime(incident,route){
  const baseTravelTime=calculateTravelTime(route),capacityExceeded=getTotalDetentionOccupancy()>=getTotalDetentionCapacity();
  incident.baseTravelTime=baseTravelTime;incident.capacityExceeded=capacityExceeded;incident.travelTime=capacityExceeded?baseTravelTime*2:baseTravelTime;
  return incident.travelTime;
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
  const warning=i.capacityExceeded?" [WAARSCHUWING] Totale cellencapaciteit bereikt. Reistijd verdubbeld.":"";
  return this.result(true,`[REISTIJD] Geschatte reistijd: ${i.travelTime} seconden.${warning}${sessionConfig.operationMode==="manualVehicle"?" Kies een beschikbaar voertuig op de kaart.":""}`);
 }
 inputSnapshot(){return{step:this.step,inputCycleState:{...simulator.inputCycleState},incidents:simulator.incidents.map(({id,status,prisonId,travelTime})=>({id,status,prisonId,travelTime})),activeDispatches:[...this.activeDispatches.keys()],activeRepositions:[...this.activeRepositions.keys()],availableVehicles:vehicles.filter(v=>v.status===STATUS.AVAILABLE).length};}
 requireInputIncident(stage){const state=simulator.inputCycleState,incident=simulator.incidents.find(item=>item.id===state.incidentId);let valid=!!state.incidentId&&!!incident;if(stage==="PRISON"||stage==="DISPATCH")valid&&=["OPEN","PARTIALLY_ASSIGNED"].includes(incident.status);if((stage==="TRAVEL_TIME"||stage==="DISPATCH")&&incident?.type!=="onscene")valid&&=!!state.prisonId&&incident.prisonId===state.prisonId;if(stage==="DISPATCH"&&incident?.type!=="onscene")valid&&=Number.isFinite(state.travelTime);if(!valid){const error=new Error(`[INVARIANT ${stage}] Ongeldige automatische invoercyclus`);console.error(error.message,this.inputSnapshot());throw error;}return incident;}
 recoverInvalidInputCycle(reason){console.error("input cycle failed",{reason,inputCycleState:{...simulator.inputCycleState}});this.resetInputCycle();return this.result(false,`[FOUT] ${reason}. De invoercyclus is hersteld.`);}
 startVehicleSelection(){
  if(!["manualVehicle","repositionTraining"].includes(sessionConfig.operationMode)||simulator.gameOver||(sessionConfig.operationMode==="manualVehicle"&&this.step!==STEPS.DISPATCH))return this.result(false,"[FOUT] Handmatige voertuigkeuze is niet beschikbaar.");
  const incident=this.getInputCycleIncident();if(!incident)return this.result(false,"[FOUT] Er is geen open melding.");
  Object.assign(simulator.vehicleSelection,{active:true,incidentId:incident.id,selectedVehicleId:null,selectedVehicleIds:[],confirming:false});Object.assign(simulator,{selectedVehicleId:null,selectedVehicleIds:[],activeIncident:incident});Object.assign(simulator.inputCycleState,{incidentId:incident.id,selectedVehicleId:null,selectedVehicleIds:[]});
  return this.result(true,`[SELECTIE] Kies ${incident.requiredUnits} beschikbare voertuigen op de kaart.`);
 }
 activateTrainingIncidentIfUnambiguous(){
  if(sessionConfig.operationMode!=="repositionTraining"||simulator.manualRepositionState.phase!=="idle")return;
  const open=simulator.incidents.filter(i=>["OPEN","PARTIALLY_ASSIGNED"].includes(i.status));
  if(open.length===1){simulator.inputCycleState.incidentId=open[0].id;this.startVehicleSelection();}
 }
 selectIncident(incidentId){
  if(!["manualVehicle","repositionTraining"].includes(sessionConfig.operationMode)||simulator.gameOver||simulator.manualRepositionState.phase!=="idle")return this.result(false,"[FOUT] Meldingselectie is niet beschikbaar.");
  const incident=simulator.incidents.find(i=>i.id===incidentId&&["OPEN","PARTIALLY_ASSIGNED"].includes(i.status));if(!incident)return this.result(false,"[FOUT] Deze melding is niet meer open.");
  simulator.activeIncident=incident;simulator.inputCycleState.incidentId=incident.id;if(simulator.vehicleSelection.active)Object.assign(simulator.vehicleSelection,{incidentId:incident.id,selectedVehicleId:null,selectedVehicleIds:[]});else if(sessionConfig.operationMode==="repositionTraining")this.startVehicleSelection();Object.assign(simulator,{selectedVehicleId:null,selectedVehicleIds:[]});return this.result(true,`[SELECTIE] Melding ${getDistrictById(incident.district)?.name} geselecteerd. Kies een voertuig voor de melding.`);
 }
 selectVehicle(vehicleId){
  const selection=simulator.vehicleSelection,training=sessionConfig.operationMode==="repositionTraining";if(!["manualVehicle","repositionTraining"].includes(sessionConfig.operationMode)||!selection.active||simulator.gameOver)return this.result(false,"[FOUT] Kies eerst een open melding.");
  const vehicle=vehicles.find(v=>v.id===vehicleId),incident=simulator.incidents.find(i=>i.id===selection.incidentId&&["OPEN","PARTIALLY_ASSIGNED"].includes(i.status));if(!vehicle||vehicle.status!==STATUS.AVAILABLE||vehicle.incident)return this.result(false,`[FOUT] ${vehicleId} is niet inzetbaar.`);if(!incident)return this.result(false,"[FOUT] De gekozen melding is niet meer open.");
  const ids=selection.selectedVehicleIds||[];const index=ids.indexOf(vehicle.id);if(index>=0)ids.splice(index,1);else if(ids.length<incident.requiredUnits)ids.push(vehicle.id);else if(incident.requiredUnits===1)ids.splice(0,1,vehicle.id);else return this.result(false,`[SELECTIE] Er zijn al ${incident.requiredUnits} voertuigen geselecteerd.`);
  selection.selectedVehicleId=ids.at(-1)||null;simulator.selectedVehicleId=selection.selectedVehicleId;simulator.selectedVehicleIds=[...ids];simulator.inputCycleState.selectedVehicleId=selection.selectedVehicleId;simulator.inputCycleState.selectedVehicleIds=[...ids];simulator.activeIncident=incident;
  if(training&&ids.length===incident.requiredUnits)return this.dispatchTrainingSelection(incident,[...ids]);
  return this.result(true,`[SELECTIE] ${ids.length}/${incident.requiredUnits} voertuigen geselecteerd.`,{selection:{vehicleIds:[...ids]}});
 }
 dispatchTrainingSelection(incident,ids){
  const events=[];for(const id of ids){const result=this.startDispatch({incidentId:incident.id,vehicleId:id,prisonId:incident.prisonId});if(!result.success)return result;events.push(...(result.events||[]));}
  const district=getDistrictById(incident.district),message=`[DISPATCH] ${ids.join(", ")} handmatig ingezet naar ${district?.name} (${ids.length}/${incident.requiredUnits}).`;
  this.clearVehicleSelection();simulator.activeIncident=null;this.activateTrainingIncidentIfUnambiguous();events.push(...this.ensureCoverage());
  return this.result(true,message,{events,vehicle:vehicles.find(v=>v.id===ids[0]),district,selection:{vehicleIds:[]}});
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
 rankVehiclesForDispatch(candidates,incident){return candidates.map(vehicle=>({vehicle,distance:getRouteDistance(getShortestRoute(vehicle.district,incident.district))})).sort((a,b)=>Number(isSpecialVehicle(a.vehicle))-Number(isSpecialVehicle(b.vehicle))||a.distance-b.distance).map(item=>item.vehicle);}
 availableVehiclesByDistance(incident){return this.rankVehiclesForDispatch(vehicles.filter(v=>v.status===STATUS.AVAILABLE&&!v.incident&&!incident.assignedVehicleIds.includes(v.id)),incident);}
 assignIncident(incident,vehicleId=null){
  if(incident?.type!=="onscene"&&!incident?.prisonId)this.prepareIncident(incident);const needed=incident.requiredUnits-incident.assignedVehicleIds.length,candidates=vehicleId?[vehicles.find(v=>v.id===vehicleId)].filter(Boolean):this.availableVehiclesByDistance(incident).slice(0,needed);const events=[];let assigned=0,firstVehicle=null;
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
  if(!incident||!["OPEN","PARTIALLY_ASSIGNED"].includes(incident.status))return fail("melding accepteert geen voertuigen");if(!vehicle||vehicle.status!==STATUS.AVAILABLE||vehicle.incident||incident.assignedVehicleIds.includes(vehicle.id))return fail("voertuig is niet beschikbaar");if(incident.type!=="onscene"&&!prison)return fail("cellencomplex is niet beschikbaar");
  const id=`DSP-${incident.id}-${vehicle.id}`,routeToIncident=getShortestRoute(vehicle.district,incident.district),routeToPrison=incident.type==="onscene"?[]:getShortestRoute(incident.district,prison.id);if(!routeToIncident.length||(incident.type!=="onscene"&&!routeToPrison.length))return fail("route kon niet worden berekend");
  if(incident.type!=="onscene"){incident.prisonId=prison.id;incident.routeToPrison=routeToPrison;if(!Number.isFinite(incident.travelTime))this.setEffectiveTravelTime(incident,routeToPrison);}incident.assignedVehicleIds.push(vehicle.id);incident.vehicleId=incident.assignedVehicleIds[0];incident.transportVehicleId??=vehicle.id;incident.status=incident.assignedVehicleIds.length>=incident.requiredUnits?"FULLY_ASSIGNED":"PARTIALLY_ASSIGNED";vehicle.status=STATUS.TO_INCIDENT;vehicle.incident=incident.id;vehicle.prison=prison?.id||null;
  const capacityEvents=[];if(["autoplay","repositionTraining"].includes(sessionConfig.operationMode)&&incident.capacityExceeded&&!incident.capacityWarningLogged){incident.capacityWarningLogged=true;capacityEvents.push({type:"capacityWarning",incident,message:"[WAARSCHUWING] Totale cellencapaciteit bereikt. Reistijd verdubbeld."});}
  const prisonPosition=prison?getDetentionComplexPositionById(prison.id):null,parkingPosition=prison?(getDetentionParkingSlot(prison.id,vehicle.id)||prisonPosition):null;
  const origin=vehicle.district,returnTargetDistrictId=vehicle.homeDistrict;
  const dispatch={id,vehicleId:vehicle.id,incidentId:incident.id,phase:STATUS.TO_INCIDENT,originDistrictId:origin,returnTargetDistrictId,incidentDistrictId:incident.district,incidentX:incident.x,incidentY:incident.y,prisonDistrictId:prison?.id||null,prisonPosition,prisonX:parkingPosition?.x,prisonY:parkingPosition?.y,routeToIncident,routeToPrison,returnRoute:getShortestRoute(incident.district,returnTargetDistrictId),prisonReturnRoute:prison?getShortestRoute(prison.id,returnTargetDistrictId):[],phaseStartTime:performance.now(),busySeconds:incident.type==="onscene"?incident.sceneBusyDurationSeconds:incident.travelTime,fromX:vehicle.x,fromY:vehicle.y,toX:incident.x,toY:incident.y};this.activeDispatches.set(id,dispatch);simulator.activeRoutes.push({id:`${id}-to-incident`,route:routeToIncident,type:"dispatch",destination:{x:incident.x,y:incident.y}});return this.result(true,`[DISPATCH] ${vehicle.id} ingezet (${incident.assignedVehicleIds.length}/${incident.requiredUnits}).`,{vehicle,district:getDistrictById(incident.district),events:capacityEvents});
 }
 update(now=performance.now()){
  // Failure freezes the exact operational snapshot, including movement and timers.
  if(simulator.gameOver)return[];
  const events=[];
  for(const d of [...this.activeDispatches.values()]){
   try{events.push(...this.updateDispatch(d,now));}
   catch(error){console.error("Dispatch update failed",d,error);this.cancelCorruptDispatch(d);events.push({type:"log",message:`[FOUT] Dispatch ${d?.id||"onbekend"} is geannuleerd; overige opdrachten gaan door.`});}
  }
  for(const r of [...this.activeRepositions.values()])events.push(...this.updateReposition(r,now));
  events.push(...this.evaluateCoverageFailure(now));
  if(simulator.gameOver)return events;
  const autoplay=simulator.autoplayState;if(["autoplay","repositionTraining"].includes(sessionConfig.operationMode)&&autoplay.running&&autoplay.nextIncidentAt!==null&&now>=autoplay.nextIncidentAt){const r=this.createIncident({autoplayGenerated:true});events.push({type:"log",message:r.message});if(r.followup)events.push({type:"log",message:r.followup});events.push(...(r.events||[]));if(!simulator.gameOver)this.scheduleNextIncident(now);}
  if(sessionConfig.operationMode!=="repositionTraining")events.push(...this.assignMissingUnits());
  if(!simulator.gameOver&&sessionConfig.operationMode==="autoplay"){const waiting=this.oldestOpen();if(waiting&&vehicles.some(v=>v.status===STATUS.AVAILABLE)){const result=this.assignIncident(waiting);events.push({type:"log",message:result.message},...(result.events||[]));}}
  if(sessionConfig.operationMode!=="repositionTraining")events.push(...this.evaluateHomeReturns(now));
  return events;
 }
 updateDispatch(d,now){
  const v=vehicles.find(x=>x.id===d.vehicleId);if(!v)return[];
  if(d.phase===STATUS.ON_SCENE){
   if((now-d.phaseStartTime)/1000<d.busySeconds)return[];
   const incident=simulator.incidents.find(i=>i.id===d.incidentId);
   this.phase(d,STATUS.RETURNING,now,d.returnRoute,getDistrictById(d.returnTargetDistrictId));v.status=STATUS.RETURNING;delete v.onSceneArrivedAt;simulator.activeRoutes.push({id:`${d.id}-return`,route:d.returnRoute,type:"return"});
   const related=[...this.activeDispatches.values()].filter(item=>item.incidentId===d.incidentId);
   if(incident&&incident.status!=="HANDLED"&&related.every(item=>item.phase===STATUS.RETURNING)){this.handleIncident(incident.id,now);simulator.incidentsHandled++;}
   return[{type:"onSceneComplete",vehicle:v,incident,district:getDistrictById(d.returnTargetDistrictId)}];
  }
  if(d.phase===STATUS.BUSY){if((now-d.phaseStartTime)/1000<d.busySeconds)return[];if(d.occupancyClaimed){simulator.detentionOccupancy[d.prisonDistrictId]=Math.max(0,(simulator.detentionOccupancy[d.prisonDistrictId]||0)-1);d.occupancyClaimed=false;}if(sessionConfig.operationMode==="repositionTraining"){v.status=STATUS.AVAILABLE;v.incident=null;v.prison=null;v.district=d.prisonDistrictId;this.place(v);this.activeDispatches.delete(d.id);return[{type:"prisonReleased",vehicle:v,prison:getDistrictById(d.prisonDistrictId)},{type:"vehicleAvailableAway",vehicle:v,district:getDistrictById(v.district)},...this.ensureCoverage()];}this.phase(d,STATUS.RETURNING,now,d.prisonReturnRoute,getDistrictById(d.returnTargetDistrictId));v.status=STATUS.RETURNING;simulator.activeRoutes.push({id:`${d.id}-return`,route:d.prisonReturnRoute,type:"return"});return[{type:"prisonReleased",vehicle:v,prison:getDistrictById(d.prisonDistrictId)},{type:"returning",vehicle:v}];}
  if(d.phase==="WAITING_AT_INCIDENT")return[];
  const route=d.phase===STATUS.TO_INCIDENT?d.routeToIncident:d.phase===STATUS.TO_PRISON?d.routeToPrison:d.returnRoute,progress=Math.min(1,(now-d.phaseStartTime)/Math.max(900,getRouteDistance(route)*this.getDriveMsPerEdge()));this.move(v,route,progress,d);if(progress<1)return[];
  if(d.phase===STATUS.TO_INCIDENT){
   const incident=simulator.incidents.find(i=>i.id===d.incidentId);this.removeRoute(`${d.id}-to-incident`);v.district=d.incidentDistrictId;if(!incident)return[];if(!incident.arrivedVehicleIds.includes(v.id))incident.arrivedVehicleIds.push(v.id);if(incident.type==="onscene"&&incident.arrivedVehicleIds.length>=1)incident.markerVisible=false;
   const arrival={type:"log",message:`[AANKOMST] ${incident.arrivedVehicleIds.length}/${incident.requiredUnits} eenheden aanwezig.`};
   if(incident.type==="onscene"){
    incident.status="ON_SCENE";v.status=STATUS.ON_SCENE;v.onSceneArrivedAt=now;d.phase=STATUS.ON_SCENE;d.phaseStartTime=now;d.onSceneArrivedAt=now;
    const index=incident.assignedVehicleIds.indexOf(v.id),angle=index*Math.PI*2/incident.assignedVehicleIds.length;v.x=incident.x+Math.cos(angle)*18;v.y=incident.y+Math.sin(angle)*18;
    return[arrival,{type:"onSceneStarted",vehicle:v,incident,seconds:incident.sceneBusyDurationSeconds}];
   }
   if(incident.arrivedVehicleIds.length<incident.requiredUnits){d.phase="WAITING_AT_INCIDENT";v.status=STATUS.TO_INCIDENT;v.x=incident.x;v.y=incident.y;return[arrival];}
   this.handleIncident(incident.id,now);simulator.incidentsHandled++;
   const events=[arrival,{type:"incidentCleared",vehicle:v,incidentId:d.incidentId}];
   for(const related of [...this.activeDispatches.values()].filter(item=>item.incidentId===incident.id)){
    const unit=vehicles.find(item=>item.id===related.vehicleId);if(!unit)continue;
    if(unit.id===incident.transportVehicleId){unit.status=STATUS.TO_PRISON;const prisonTarget={x:related.prisonX,y:related.prisonY};this.phase(related,STATUS.TO_PRISON,now,related.routeToPrison,prisonTarget);simulator.activeRoutes.push({id:`${related.id}-to-prison`,route:related.routeToPrison,type:"to-prison",destination:prisonTarget});events.push({type:"transport",vehicle:unit,district:getDistrictById(related.prisonDistrictId)});
    }else if(sessionConfig.operationMode==="repositionTraining"){unit.status=STATUS.AVAILABLE;unit.incident=null;unit.prison=null;unit.district=incident.district;this.place(unit);this.activeDispatches.delete(related.id);events.push({type:"vehicleAvailableAway",vehicle:unit,district:getDistrictById(unit.district)});
    }else{unit.status=STATUS.RETURNING;this.phase(related,STATUS.RETURNING,now,related.returnRoute,getDistrictById(related.returnTargetDistrictId));simulator.activeRoutes.push({id:`${related.id}-return`,route:related.returnRoute,type:"return"});events.push({type:"returning",vehicle:unit});}
   }return events;
  }
  if(d.phase===STATUS.TO_PRISON){v.status=STATUS.BUSY;this.removeRoute(`${d.id}-to-prison`);d.phase=STATUS.BUSY;d.phaseStartTime=now;if(!d.occupancyClaimed){simulator.detentionOccupancy[d.prisonDistrictId]=(simulator.detentionOccupancy[d.prisonDistrictId]||0)+1;d.occupancyClaimed=true;}return[{type:"prisonReached",vehicle:v,prison:getDistrictById(d.prisonDistrictId),occupancy:simulator.detentionOccupancy[d.prisonDistrictId],capacity:sessionConfig.detentionCapacity[d.prisonDistrictId],seconds:d.busySeconds}];}
  v.status=STATUS.AVAILABLE;v.incident=null;v.prison=null;v.district=d.returnTargetDistrictId;this.place(v);this.removeRoute(`${d.id}-return`);this.activeDispatches.delete(d.id);return[{type:"vehicleReturned",vehicle:v},...this.ensureCoverage()];
 }
 getDriveMsPerEdge(){return DRIVE_MS_PER_EDGE;}
 updateReposition(r,now){const v=vehicles.find(x=>x.id===r.vehicleId);if(!v)return[];const p=Math.min(1,(now-r.phaseStartTime)/Math.max(900,getRouteDistance(r.route)*this.getDriveMsPerEdge()));this.move(v,r.route,p,r);if(p<1)return[];v.district=r.targetDistrictId;v.status=STATUS.AVAILABLE;v.lastRepositionedAt=performance.now();this.place(v);this.activeRepositions.delete(r.id);this.removeRoute(r.id);return[{type:"repositionComplete",repositionType:r.type,vehicle:v,district:getDistrictById(v.district),origin:getDistrictById(r.originDistrictId)},...this.ensureCoverage()];}
 getIncomingRepositions(districtId){return[...this.activeRepositions.values()].filter(r=>r.targetDistrictId===districtId).length;}
 getEffectiveCoverage(districtId){return this.availableCount(districtId)+this.getIncomingRepositions(districtId);}
 getCoverageTargets(){return getCoverageTargets([...this.activeRepositions.values()]);}
 getMostUndercoveredHotzone(targets=this.getCoverageTargets()){
  const hotzoneIds=new Set(sessionConfig.hotzoneDistrictIds||[]);
  return districts.filter(d=>hotzoneIds.has(d.id)).sort((a,b)=>targets.effectiveByDistrict[a.id]-targets.effectiveByDistrict[b.id]||(targets.hotzoneMinimum-targets.effectiveByDistrict[b.id])-(targets.hotzoneMinimum-targets.effectiveByDistrict[a.id]))[0]||null;
 }
 findCoverageDonor(target,targets,hotzonePriority=false){
  const hotzoneIds=new Set(sessionConfig.hotzoneDistrictIds||[]),targetCoverage=targets.effectiveByDistrict[target.id];
  return districts.filter(d=>d.id!==target.id&&this.availableCount(d.id)>0&&getShortestRoute(d.id,target.id).length).filter(d=>{
   const after=this.availableCount(d.id)-1;
   if(hotzoneIds.has(d.id))return after>=targets.hotzoneMinimum&&after>=targets.maxNonHotzoneAvailable;
   return hotzonePriority?after>=targetCoverage:after>=1;
  }).sort((a,b)=>Number(hotzoneIds.has(a.id))-Number(hotzoneIds.has(b.id))||this.availableCount(b.id)-this.availableCount(a.id)||getRouteDistance(getShortestRoute(a.id,target.id))-getRouteDistance(getShortestRoute(b.id,target.id)))[0]||null;
 }
 getCriticalCoverageDistricts(){return districts.filter(d=>this.availableCount(d.id)===0);}
 hasCriticalCoverageFailure(){return this.getCriticalCoverageDistricts().length>0;}
 hasRelevantIncomingReposition(){return this.getCriticalCoverageDistricts().some(d=>this.getIncomingRepositions(d.id)>0);}
 canAnyRepositionStillImproveCoverage(){
  return this.getCriticalCoverageDistricts().some(target=>this.findCoverageDonor(target,this.getCoverageTargets(),false)!==null);
 }
 hasTemporaryCoverageRecovery(){
  // Dispatched units return to their origin and repositioning units become available
  // at their destination. Neither lifecycle is a definitive fleet loss.
  return this.activeDispatches.size>0||this.activeRepositions.size>0||vehicles.some(v=>[STATUS.BUSY,STATUS.ON_SCENE,STATUS.RETURNING,STATUS.TO_INCIDENT,STATUS.TO_PRISON].includes(v.status));
 }
 evaluateCoverageFailure(now=performance.now()){
  if(simulator.gameOver)return[];
  let critical=null;
  for(const district of districts){
   if(this.availableCount(district.id)>=1){this.coverageLossStartedAt.delete(district.id);continue;}
   if(!this.coverageLossStartedAt.has(district.id)){this.coverageLossStartedAt.set(district.id,now);continue;}
   if(now-this.coverageLossStartedAt.get(district.id)>=COVERAGE_GRACE_PERIOD_MS){critical=district;break;}
  }
  if(!critical)return[];
  return[
   {type:"log",message:`[COVERAGE] ${critical.name} had langer dan 2 seconden geen beschikbare eenheid.`},
   {type:"log",message:"[SITUATIE] Herpositioneren is niet meer mogelijk."},
   this.triggerRepositioningFailure(critical)
  ];
 }
 evaluateRepositioningFailure(now=performance.now()){return this.evaluateCoverageFailure(now);}
 rankVehiclesForReposition(candidates,donorId){return [...candidates].sort((a,b)=>Number(isSpecialVehicle(a))-Number(isSpecialVehicle(b))||Number(a.homeDistrict!==donorId)-Number(b.homeDistrict!==donorId));}
 startAutomaticReposition(donor,target){const candidates=this.rankVehiclesForReposition(vehicles.filter(x=>x.district===donor.id&&x.status===STATUS.AVAILABLE),donor.id);const v=candidates[0],route=getShortestRoute(donor.id,target.id);if(!v||!route.length)return null;const id=`REP-${++this.repositionSequence}`,r={id,type:"automatic",originDistrictId:donor.id,sourceDistrictId:donor.id,vehicleId:v.id,targetDistrictId:target.id,route,phaseStartTime:performance.now(),fromX:v.x,fromY:v.y,toX:target.x,toY:target.y};v.status=STATUS.REPOSITIONING;this.activeRepositions.set(id,r);simulator.activeRoutes.push({id,route,type:"reposition"});return{type:"repositionStarted",vehicle:v,district:target,origin:donor};}
 evaluateHomeReturns(now=performance.now()){
  if(simulator.gameOver)return[];
  const movements=[...this.activeRepositions.values()];
  const blockedDistricts=new Set(movements.flatMap(item=>[item.originDistrictId,item.targetDistrictId]));
  const targets=this.getCoverageTargets(),hotzones=new Set(sessionConfig.hotzoneDistrictIds||[]);
  const vehicle=vehicles.filter(item=>item.status===STATUS.AVAILABLE&&!item.incident&&item.district!==item.homeDistrict&&now-(item.lastRepositionedAt??-Infinity)>=REPOSITION_COOLDOWN_MS&&!blockedDistricts.has(item.district)&&!blockedDistricts.has(item.homeDistrict)&&this.availableCount(item.district)-1>=(hotzones.has(item.district)?targets.hotzoneMinimum:1)).sort((a,b)=>Number(isSpecialVehicle(b))-Number(isSpecialVehicle(a)))[0];
  if(!vehicle)return[];
  const origin=getDistrictById(vehicle.district),target=getDistrictById(vehicle.homeDistrict),route=getShortestRoute(origin.id,target.id);
  if(!origin||!target||!route.length)return[];
  const id=`REP-${++this.repositionSequence}`,reposition={id,type:"restore",originDistrictId:origin.id,sourceDistrictId:origin.id,vehicleId:vehicle.id,targetDistrictId:target.id,route,phaseStartTime:performance.now(),fromX:vehicle.x,fromY:vehicle.y,toX:target.x,toY:target.y};
  vehicle.status=STATUS.REPOSITIONING;this.activeRepositions.set(id,reposition);simulator.activeRoutes.push({id,route,type:"reposition"});
  return[{type:"restoreStarted",vehicle,district:target,origin},{type:"log",message:`[HERSTEL] ${vehicle.id} keert terug naar eigen district ${target.name}.`}];
 }
 ensureCoverage(){
  if(simulator.gameOver)return[];const events=[],mode=sessionConfig.operationMode;
  if(mode==="repositionTraining"){
   for(const target of this.getCriticalCoverageDistricts())events.push({type:"log",message:`[DEKKING] ${target.name} heeft 0 beschikbare voertuigen. Herpositioneer handmatig met H.`});
   events.push(...this.evaluateCoverageFailure());return events;
  }
  const hotzoneAutomation=["automatic","autoplay"].includes(mode)&&(sessionConfig.hotzoneDistrictIds||[]).length>0;
  if(hotzoneAutomation){for(let attempts=0;attempts<vehicles.length;attempts++){const targets=this.getCoverageTargets(),target=this.getMostUndercoveredHotzone(targets);if(!target)break;const current=targets.effectiveByDistrict[target.id],needsMinimum=current<targets.hotzoneMinimum,needsParity=targets.maxNonHotzoneAvailable!==null&&current<targets.maxNonHotzoneAvailable;if(!needsMinimum&&!needsParity)break;const donor=this.findCoverageDonor(target,targets,true);if(!donor)break;const event=this.startAutomaticReposition(donor,target);if(!event)break;events.push(event);}}
  for(const target of districts){if(this.getEffectiveCoverage(target.id)>0)continue;const targets=this.getCoverageTargets(),donor=this.findCoverageDonor(target,targets,false);if(!donor)break;const event=this.startAutomaticReposition(donor,target);if(event)events.push(event);}
  events.push(...this.evaluateHomeReturns(),...this.evaluateCoverageFailure());return events;
 }
 startManualReposition(){
  if(simulator.gameOver)return this.result(false,"[FOUT] Herpositioneren is niet meer mogelijk.");
  if(!["autoplay","repositionTraining"].includes(sessionConfig.operationMode)&&(this.step!==STEPS.INCIDENT||simulator.vehicleSelection.active))return this.result(false,"[FOUT] Maak eerst de huidige melding af.");
  if(sessionConfig.operationMode==="repositionTraining")this.clearVehicleSelection();
  Object.assign(simulator.manualRepositionState,{phase:"selectVehicle",selectedVehicleId:null,targetDistrictId:null});
  return this.result(true,"[DEKKING] Handmatige herpositioneringsmodus gestart. Kies eerst een beschikbaar voertuig.");
 }
 cancelManualReposition(){this.clearManualReposition();this.activateTrainingIncidentIfUnambiguous();return this.result(true,"[DEKKING] Handmatige herpositionering geannuleerd.");}
 clearManualReposition(){Object.assign(simulator.manualRepositionState,{phase:"idle",selectedVehicleId:null,targetDistrictId:null});this.removeRoute("manual-reposition-preview");}
 handleManualRepositionAction(){return simulator.manualRepositionState.phase==="idle"?this.startManualReposition():this.result(false,"[DEKKING] Kies eerst een beschikbaar voertuig en een doeldistrict.");}
 selectRepositionVehicle(vehicleId){
  const state=simulator.manualRepositionState,vehicle=vehicles.find(v=>v.id===vehicleId);
  if(state.phase!=="selectVehicle")return this.result(false,"[FOUT] Kies nu geen voertuig.");
  if(!vehicle||vehicle.status!==STATUS.AVAILABLE||vehicle.incident||[...this.activeRepositions.values()].some(r=>r.vehicleId===vehicleId))return this.result(false,`[FOUT] ${vehicleId} is niet beschikbaar.`);
  Object.assign(state,{phase:"selectDistrict",selectedVehicleId:vehicle.id,targetDistrictId:null});this.removeRoute("manual-reposition-preview");
  return this.result(true,`[SELECTIE] ${vehicle.id} geselecteerd voor herpositionering. Kies een doeldistrict.`);
 }
 selectRepositionTarget(targetDistrictId){
  if(this.manualRepositionStarting)return this.result(false,"[DEKKING] Herpositionering wordt al gestart.");
  const state=simulator.manualRepositionState,vehicle=vehicles.find(v=>v.id===state.selectedVehicleId),target=getDistrictById(targetDistrictId);
  if(state.phase!=="selectDistrict"||!vehicle)return this.result(false,"[FOUT] Kies eerst een beschikbaar voertuig.");
  if(!target||target.id===vehicle.district)return this.result(false,"[FOUT] Kies een ander doeldistrict.");
  Object.assign(state,{targetDistrictId:target.id});
  this.manualRepositionStarting=true;
  try{return this.startManualRepositionDispatch();}
  finally{this.manualRepositionStarting=false;}
 }
 startManualRepositionDispatch(){
  const state=simulator.manualRepositionState;
  if(state.phase!=="selectDistrict"||simulator.gameOver)return this.result(false,"[FOUT] Herpositioneren is niet meer mogelijk.");
  if(!state.selectedVehicleId||!state.targetDistrictId)return this.result(false,"[FOUT] Kies eerst een voertuig en doeldistrict.");
  const vehicle=vehicles.find(v=>v.id===state.selectedVehicleId),target=getDistrictById(state.targetDistrictId);
  const unavailable=!vehicle||vehicle.status!==STATUS.AVAILABLE||vehicle.incident||[...this.activeDispatches.values()].some(d=>d.vehicleId===state.selectedVehicleId)||[...this.activeRepositions.values()].some(r=>r.vehicleId===state.selectedVehicleId);
  if(unavailable){const vehicleId=vehicle?.id||state.selectedVehicleId;Object.assign(state,{phase:"selectVehicle",selectedVehicleId:null,targetDistrictId:null});this.removeRoute("manual-reposition-preview");return this.result(false,`[WAARSCHUWING] ${vehicleId} is niet meer beschikbaar. Kies opnieuw een voertuig.`);}
  if(!target){Object.assign(state,{phase:"selectDistrict",targetDistrictId:null});this.removeRoute("manual-reposition-preview");return this.result(false,"[WAARSCHUWING] Het doeldistrict is niet meer geldig. Kies opnieuw een doeldistrict.");}
  const route=getShortestRoute(vehicle.district,target.id);if(!route.length||target.id===vehicle.district){Object.assign(state,{phase:"selectDistrict",targetDistrictId:null});this.removeRoute("manual-reposition-preview");return this.result(false,"[WAARSCHUWING] Herpositioneringsroute is niet meer geldig. Kies opnieuw een doeldistrict.");}
  const origin=getDistrictById(vehicle.district),id=`REP-${++this.repositionSequence}`;vehicle.status=STATUS.REPOSITIONING;
  const reposition={id,type:"manual",originDistrictId:origin.id,vehicleId:vehicle.id,targetDistrictId:target.id,route,phaseStartTime:performance.now(),fromX:vehicle.x,fromY:vehicle.y,toX:target.x,toY:target.y};
  this.activeRepositions.set(id,reposition);this.removeRoute("manual-reposition-preview");simulator.activeRoutes.push({id,route,type:"reposition"});this.clearManualReposition();
  this.activateTrainingIncidentIfUnambiguous();return this.result(true,`[HANDMATIGE HERPOSITIONERING] ${vehicle.id} vertrekt van ${origin.name} naar ${target.name}.`,{events:[{type:"manualRepositionStarted",vehicle,district:target,origin},...this.ensureCoverage()]});
 }
 confirmManualReposition(){return this.result(false,"[FOUT] Kies een doeldistrict om de herpositionering direct te starten.");}
 scheduleNextIncident(now=performance.now()){const delay=getRandomIncidentDelaySeconds();Object.assign(simulator.autoplayState,{nextDelaySeconds:delay,nextIncidentAt:now+delay*1000});return delay;}
 toggleAutoplay(){const training=sessionConfig.operationMode==="repositionTraining";if(!["autoplay","repositionTraining"].includes(sessionConfig.operationMode)||simulator.gameOver)return this.result(false,"[FOUT] Automatische meldingen zijn niet actief.");const state=simulator.autoplayState;state.running=!state.running;if(state.running)this.scheduleNextIncident();else Object.assign(state,{nextIncidentAt:null,nextDelaySeconds:null});return this.result(true,training?`[MODUS] Herpositioneringsmodus ${state.running?"gestart":"gepauzeerd"}. ${state.running?"Beheer de dekking met H.":"Lopende opdrachten rijden door."}`:`[MODUS] Autoplay ${state.running?"gestart":"gepauzeerd"}. Lopende opdrachten rijden door.`);}
 getControlState(){const blocked=simulator.gameOver,mode=sessionConfig.operationMode,autoplay=["autoplay","repositionTraining"].includes(mode),manual=mode==="manualVehicle",selecting=simulator.vehicleSelection.active,repositionState=simulator.manualRepositionState,repositioning=repositionState.phase!=="idle";return{incident:!blocked&&!autoplay&&this.step===STEPS.INCIDENT,prison:!blocked&&!autoplay&&this.step===STEPS.PRISON,travelTime:!blocked&&!autoplay&&this.step===STEPS.TRAVEL_TIME,dispatch:!blocked&&mode==="automatic"&&this.step===STEPS.DISPATCH,confirmVehicle:!blocked&&manual&&selecting&&(simulator.vehicleSelection.selectedVehicleIds||[]).length>0&&!simulator.vehicleSelection.confirming,autoplayToggle:!blocked&&autoplay,reset:true,currentStep:this.step,gameOver:simulator.gameOver,mode,autoplayRunning:simulator.autoplayState.running,vehicleSelectionActive:selecting,manualRepositionActive:repositioning,manualRepositionPhase:repositionState.phase,manualRepositionStart:!blocked&&repositionState.phase==="idle"&&(autoplay||this.step===STEPS.INCIDENT)&&(mode==="repositionTraining"||!selecting),manualRepositionConfirm:false};}
 reset(o={}){Object.assign(simulator,{activeIncident:null,selectedPrison:null,travelTime:null,detentionOccupancy:createEmptyDetentionOccupancy(),incidentsHandled:0,gameOver:false,failureInspectionMode:false,activeRoute:[],activeRoutes:[],incidentHistory:[],repositioningFailure:null,incidents:[],selectedVehicleId:null,selectedVehicleIds:[],vehicleSelection:{active:false,incidentId:null,selectedVehicleId:null,selectedVehicleIds:[],confirming:false},inputCycleState:{step:STEPS.INCIDENT,incidentId:null,prisonId:null,travelTime:null,selectedVehicleId:null,selectedVehicleIds:[]},manualRepositionState:{phase:"idle",selectedVehicleId:null,targetDistrictId:null},autoplayState:{running:false,nextIncidentAt:null,nextDelaySeconds:null}});if(o.restoreDefaults)resetSessionConfigDefaults();if(o.availablePrisons)setAvailablePrisons(o.availablePrisons);if(o.detentionCapacity)setDetentionCapacity(o.detentionCapacity);if(o.vehiclesPerDistrict)setVehiclesPerDistrict(o.vehiclesPerDistrict);if(o.hotzoneDistrictIds!==undefined)setHotzoneDistrictIds(o.hotzoneDistrictIds);if(o.hotzoneIncidentPercentage!==undefined)sessionConfig.hotzoneIncidentPercentage=Math.max(0,Math.min(100,Number(o.hotzoneIncidentPercentage)));if(o.operationMode)sessionConfig.operationMode=o.operationMode;if(o.onSceneIncidentPercentage!==undefined)sessionConfig.onSceneIncidentPercentage=Math.max(0,Math.min(100,Number(o.onSceneIncidentPercentage)));if(o.multiUnitIncidentPercentage!==undefined)sessionConfig.multiUnitIncidentPercentage=Math.max(0,Math.min(100,Number(o.multiUnitIncidentPercentage)));if(o.autoplayMinDelaySeconds!==undefined)sessionConfig.autoplayMinDelaySeconds=Math.max(1,Math.min(60,Number(o.autoplayMinDelaySeconds)));if(o.autoplayMaxDelaySeconds!==undefined)sessionConfig.autoplayMaxDelaySeconds=Math.max(sessionConfig.autoplayMinDelaySeconds,Math.min(60,Number(o.autoplayMaxDelaySeconds)));initializeVehicles();this.activeDispatches.clear();this.activeRepositions.clear();this.coverageLossStartedAt.clear();return this.result(true,sessionConfig.operationMode==="autoplay"?"[MODUS] Autoplay klaar — druk op Play.":sessionConfig.operationMode==="repositionTraining"?"[MODUS] Herpositioneringsmodus klaar — start de oefening en beheer de dekking met H.":"[RESET] Nieuwe oefening gestart.");}
 triggerRepositioningFailure(d){this.clearVehicleSelection();this.clearManualReposition();simulator.gameOver=true;simulator.failureInspectionMode=false;Object.assign(simulator.autoplayState,{running:false,nextIncidentAt:null,nextDelaySeconds:null});simulator.repositioningFailure={districtName:d.name,coveragePercentage:this.calculateCoveragePercentage(),availableVehicles:vehicles.filter(v=>v.status===STATUS.AVAILABLE).length,title:repositioningFailureConfig.title,explanation:`${d.name} had langer dan 2 seconden geen beschikbare eenheid.`};return{type:"repositioningFailure",failure:simulator.repositioningFailure};}
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
 createIncidentPosition(){
  const hotzones=districts.filter(district=>(sessionConfig.hotzoneDistrictIds||[]).includes(district.id));
  if(!hotzones.length)return this.createRandomIncidentPosition();
  const nonHotzones=districts.filter(district=>!hotzones.includes(district));
  const preferHotzone=Math.random()*100<sessionConfig.hotzoneIncidentPercentage;
  const pool=preferHotzone||!nonHotzones.length?hotzones:nonHotzones;
  return this.createIncidentPositionForDistrict(this.random(pool).id);
 }
 createIncidentPositionForDistrict(districtId){
  return this.createRandomIncidentPosition(candidate=>this.nearestDistrict(candidate).id===districtId,2000,districtId);
 }
 createRandomIncidentPosition(predicate=()=>true,maxAttempts=200,fallbackDistrictId=null){
  const xs=INCIDENT_SPAWN_POLYGON.map(p=>p.x),ys=INCIDENT_SPAWN_POLYGON.map(p=>p.y),bounds={minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)};let best=null,bestDistance=-1,validAttempts=0,totalAttempts=0;
  while(validAttempts<20&&totalAttempts++<maxAttempts){const candidate={x:Math.round(bounds.minX+Math.random()*(bounds.maxX-bounds.minX)),y:Math.round(bounds.minY+Math.random()*(bounds.maxY-bounds.minY))};if(!pointInPolygon(candidate)||distanceToPolygonEdge(candidate)<INCIDENT_MARGIN||!predicate(candidate))continue;validAttempts++;const distance=simulator.incidents.length?Math.min(...simulator.incidents.map(i=>Math.hypot(candidate.x-i.x,candidate.y-i.y))):Infinity;if(distance>=INCIDENT_MIN_DISTANCE)return candidate;if(distance>bestDistance){best=candidate;bestDistance=distance;}}
  if(best)return best;
  const district=districts.find(item=>item.id===fallbackDistrictId);
  return district?{x:district.x+1,y:district.y+1}:{x:550,y:350};
 }
}
