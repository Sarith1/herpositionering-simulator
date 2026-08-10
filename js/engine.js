import { detentionComplexes, districts, initializeVehicles, resetSessionConfigDefaults, repositioningFailureConfig, sessionConfig, setAvailablePrisons, setVehiclesPerDistrict, simulator, vehicles } from "./data.js";
import { calculateTravelTime, findNearestAvailableVehicle, getDistrictById, getPrisonDistricts, getRouteDistance, getShortestRoute } from "./routing.js";

const STATUS = { AVAILABLE:"AVAILABLE", TO_INCIDENT:"TO_INCIDENT", TO_PRISON:"TO_PRISON", BUSY:"BUSY", RETURNING:"RETURNING", REPOSITIONING:"REPOSITIONING" };
const STEPS = { INCIDENT:"incident", PRISON:"prison", TRAVEL_TIME:"travelTime", DISPATCH:"dispatch" };
const DRIVE_MS_PER_EDGE = 1400;
export const INCIDENT_MARGIN = 38;
export const INCIDENT_MIN_DISTANCE = 45;
export function getRandomIncidentDelaySeconds(){return Math.floor(Math.random()*20)+1;}
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
 constructor(){ this.activeDispatches=new Map(); this.activeRepositions=new Map(); this.sequence=0; this.repositionSequence=0; this.step="incident"; }
 setStep(step){this.step=step;simulator.inputCycleState.step=step;}
 resetInputCycle(){
  this.removeRoute("vehicle-selection-preview");
  Object.assign(simulator.inputCycleState,{step:STEPS.INCIDENT,incidentId:null,prisonId:null,travelTime:null,selectedVehicleId:null,selectionActive:false});
  Object.assign(simulator.vehicleSelection,{active:false,incidentId:null,selectedVehicleId:null,confirming:false});
  Object.assign(simulator,{activeIncident:null,selectedPrison:null,travelTime:null,selectedVehicleId:null,activeRoute:[]});
  this.step=STEPS.INCIDENT;
 }
 createIncident(options={}) {
  if(simulator.gameOver) return this.result(false,"[FOUT] De oefening is geblokkeerd.");
  const autoplay=options.automatic || sessionConfig.operationMode==="autoplay";
  if(!autoplay&&this.step!==STEPS.INCIDENT)return this.result(false,"[FOUT] Maak eerst de huidige knopcyclus af.");
  const position=this.createIncidentPosition(),district=this.nearestDistrict(position), incident={id:`INC-${Date.now()}-${++this.sequence}`,district:district.id,districtId:district.id,x:position.x,y:position.y,status:"OPEN",createdAt:performance.now(),prisonId:null,travelTime:null};
  simulator.incidents.push(incident); simulator.activeIncident=incident;simulator.inputCycleState.incidentId=incident.id;
  let dispatchResult=null;
  if(autoplay){this.prepareIncident(incident);dispatchResult=this.assignIncident(incident);if(dispatchResult.success)this.resetInputCycle();}
  else this.setStep(STEPS.PRISON);
  return this.result(true,`[MELDING] Nieuwe ${options.automatic ? "automatische " : ""}melding in ${district.name}.`,{district,events:dispatchResult?.events||[],followup:dispatchResult?.message});
 }
 prepareIncident(incident){
  const prisons=getPrisonDistricts(); if(!prisons.length) return;
  const ranked=prisons.map(prison=>({prison,route:getShortestRoute(incident.district,prison.id)})).filter(x=>x.route.length).sort((a,b)=>getRouteDistance(a.route)-getRouteDistance(b.route));
  const choice=ranked[0]; incident.prisonId=choice.prison.id; incident.routeToPrison=choice.route; incident.travelTime=calculateTravelTime(choice.route); simulator.selectedPrison=choice.prison.id; simulator.activeRoute=choice.route;
 }
 getInputCycleIncident(requiredStatus="OPEN"){
  const id=simulator.inputCycleState.incidentId;
  return simulator.incidents.find(incident=>incident.id===id&&(!requiredStatus||incident.status===requiredStatus))||null;
 }
 selectPrison(){ if(this.step!==STEPS.PRISON)return this.result(false,"[FOUT] Plaats eerst een melding.");const i=this.getInputCycleIncident();if(!i)return this.recoverInvalidInputCycle("melding voor deze invoercyclus ontbreekt");this.prepareIncident(i);Object.assign(simulator.inputCycleState,{prisonId:i.prisonId,travelTime:null});this.setStep(STEPS.TRAVEL_TIME);return this.result(true,`[CEL] ${getDistrictById(i.prisonId)?.name} geselecteerd.`); }
 calculateTravelTime(){ if(this.step!==STEPS.TRAVEL_TIME)return this.result(false,"[FOUT] Selecteer eerst een cel.");const i=this.getInputCycleIncident();if(!i||i.prisonId!==simulator.inputCycleState.prisonId)return this.recoverInvalidInputCycle("melding of cellencomplex voor deze invoercyclus ontbreekt");simulator.inputCycleState.travelTime=i.travelTime;this.setStep(STEPS.DISPATCH);return this.result(true,`[REISTIJD] Geschatte reistijd: ${i.travelTime} seconden.`); }
 recoverInvalidInputCycle(reason){console.error("input cycle failed",{reason,inputCycleState:{...simulator.inputCycleState}});this.resetInputCycle();return this.result(false,`[FOUT] ${reason}. De invoercyclus is hersteld.`);}
 startVehicleSelection(){
  if(sessionConfig.operationMode!=="manualVehicle"||simulator.gameOver)return this.result(false,"[FOUT] Handmatige voertuigkeuze is niet beschikbaar.");
  if(this.step!==STEPS.DISPATCH)return this.result(false,"[FOUT] Bereken eerst de reistijd met knop 3.");
  const incident=this.getInputCycleIncident();
  if(!incident)return this.result(false,"[FOUT] Er is geen open melding.");
  Object.assign(simulator.vehicleSelection,{active:true,incidentId:incident.id,selectedVehicleId:null,confirming:false});simulator.selectedVehicleId=null;simulator.activeIncident=incident;Object.assign(simulator.inputCycleState,{incidentId:incident.id,selectionActive:true,selectedVehicleId:null});
  return this.result(true,"[SELECTIE] Kies een beschikbaar voertuig op de kaart.");
 }
 selectIncident(incidentId){
  if(sessionConfig.operationMode!=="manualVehicle"||simulator.gameOver)return this.result(false,"[FOUT] Meldingselectie is niet beschikbaar.");
  const incident=simulator.incidents.find(i=>i.id===incidentId&&i.status==="OPEN");if(!incident)return this.result(false,"[FOUT] Deze melding is niet meer open.");
  simulator.activeIncident=incident;simulator.inputCycleState.incidentId=incident.id;if(simulator.vehicleSelection.active)Object.assign(simulator.vehicleSelection,{incidentId:incident.id,selectedVehicleId:null});simulator.selectedVehicleId=null;
  return this.result(true,`[SELECTIE] Melding ${getDistrictById(incident.district)?.name} geselecteerd.`);
 }
 selectVehicle(vehicleId){
  const selection=simulator.vehicleSelection;
  if(sessionConfig.operationMode!=="manualVehicle"||!selection.active||simulator.gameOver)return this.result(false,"[FOUT] Start eerst de voertuigkeuze met ‘Selecteer voertuig’.");
  const vehicle=vehicles.find(v=>v.id===vehicleId),incident=simulator.incidents.find(i=>i.id===selection.incidentId&&i.status==="OPEN");
  if(!vehicle||vehicle.status!==STATUS.AVAILABLE||vehicle.incident)return this.result(false,`[FOUT] ${vehicleId} is niet inzetbaar.`);if(!incident)return this.result(false,"[FOUT] De gekozen melding is niet meer open.");
  selection.selectedVehicleId=vehicle.id;simulator.selectedVehicleId=vehicle.id;simulator.inputCycleState.selectedVehicleId=vehicle.id;simulator.activeIncident=incident;this.removeRoute("vehicle-selection-preview");simulator.activeRoutes.push({id:"vehicle-selection-preview",route:getShortestRoute(vehicle.district,incident.district),type:"selection-preview",destination:{x:incident.x,y:incident.y}});
  const route=getShortestRoute(vehicle.district,incident.district),distance=getRouteDistance(route),remaining=this.availableCount(vehicle.district)-1;
  return this.result(true,`[SELECTIE] ${vehicle.id} geselecteerd.`,{selection:{vehicleId:vehicle.id,district:getDistrictById(vehicle.district)?.name,incident:getDistrictById(incident.district)?.name,route:`${getDistrictById(vehicle.district)?.name} → ${getDistrictById(incident.district)?.name}`,distance,eta:Math.max(1,distance*10),remaining,coverage:this.projectedCoverage(vehicle)}});
 }
 cancelVehicleSelection(){this.clearVehicleSelection();return this.result(true,"[SELECTIE] Voertuigkeuze geannuleerd.");}
 clearVehicleSelection(){Object.assign(simulator.vehicleSelection,{active:false,incidentId:null,selectedVehicleId:null,confirming:false});Object.assign(simulator.inputCycleState,{selectionActive:false,selectedVehicleId:null});simulator.selectedVehicleId=null;this.removeRoute("vehicle-selection-preview");}
 confirmManualDispatch(){
  if(sessionConfig.operationMode!=="manualVehicle"||this.step!==STEPS.DISPATCH||simulator.gameOver)return this.result(false,"[FOUT] Handmatige inzet is nu niet mogelijk.");
  const selection=simulator.vehicleSelection,selectedVehicleId=simulator.inputCycleState.selectedVehicleId,selectedIncidentId=simulator.inputCycleState.incidentId;
  if(!selection.active||!selectedVehicleId)return this.result(false,"[FOUT] Selecteer eerst een beschikbaar voertuig op de kaart.");
  if(!selectedIncidentId)return this.result(false,"[FOUT] Selecteer eerst een open melding.");
  if(selection.confirming)return this.result(false,"[FOUT] Deze inzet wordt al verwerkt.");
  const incident=simulator.incidents.find(i=>i.id===selectedIncidentId&&i.status==="OPEN"),vehicle=vehicles.find(v=>v.id===selectedVehicleId);
  if(!incident||!vehicle||vehicle.status!==STATUS.AVAILABLE||vehicle.incident){this.resetInputCycle();return this.result(false,"[FOUT] Voertuig of melding is niet meer beschikbaar. De invoercyclus is hersteld.");}
  selection.confirming=true;
  const districtName=getDistrictById(incident.district)?.name,result=this.startDispatch({incidentId:incident.id,vehicleId:vehicle.id,prisonId:incident.prisonId});
  if(result.success){this.resetInputCycle();result.message=`[DISPATCH] ${vehicle.id} handmatig ingezet voor melding ${districtName}.`;}else selection.confirming=false;
  return result;
 }
 dispatchVehicle(){
  if(sessionConfig.operationMode!=="autoplay"&&this.step!==STEPS.DISPATCH)return this.result(false,"[FOUT] Bereken eerst de reistijd met knop 3.");
  if(sessionConfig.operationMode==="manualVehicle")return this.result(false,"[FOUT] Gebruik ‘Selecteer voertuig’ en daarna ‘Voertuig inzetten’.");
  const incident=this.getInputCycleIncident();if(!incident)return this.recoverInvalidInputCycle("de gekozen melding is niet meer OPEN");
  const {prisonId}=simulator.inputCycleState;if(!prisonId||incident.prisonId!==prisonId)return this.recoverInvalidInputCycle("het gekozen cellencomplex ontbreekt");
  const nearest=findNearestAvailableVehicle(vehicles,incident.district);
  if(!nearest.vehicle)return this.result(false,`[WACHT] Melding ${getDistrictById(incident.district)?.name} wacht op beschikbaar voertuig.`);
  const result=this.startDispatch({incidentId:incident.id,vehicleId:nearest.vehicle.id,prisonId});if(result.success)this.resetInputCycle();return result;
 }
 assignIncident(incident,vehicleId=null){
  if(!incident?.prisonId)this.prepareIncident(incident);
  const vehicle=vehicleId?vehicles.find(v=>v.id===vehicleId):findNearestAvailableVehicle(vehicles,incident.district).vehicle;
  if(!vehicle)return this.result(false,`[WACHT] Melding ${getDistrictById(incident.district)?.name} wacht op beschikbaar voertuig.`);
  return this.startDispatch({incidentId:incident.id,vehicleId:vehicle.id,prisonId:incident.prisonId});
 }
 startDispatch({incidentId,vehicleId,prisonId}){
  const incident=simulator.incidents.find(i=>i.id===incidentId),vehicle=vehicles.find(v=>v.id===vehicleId),prison=getPrisonDistricts().find(p=>p.id===prisonId);
  const fail=reason=>{console.error("dispatch failed",{reason,incident,vehicle,prison});return this.result(false,`[FOUT] Dispatch niet gestart: ${reason}.`);};
  if(!incident||incident.status!=="OPEN")return fail("melding is niet open");
  if(!vehicle||vehicle.status!==STATUS.AVAILABLE||vehicle.incident)return fail("voertuig is niet beschikbaar");
  if(!prison)return fail("cellencomplex is niet beschikbaar");
  const id=`DSP-${incident.id}`;if(this.activeDispatches.has(id))return fail("melding heeft al een dispatch");
  const routeToIncident=getShortestRoute(vehicle.district,incident.district),routeToPrison=getShortestRoute(incident.district,prison.id);
  if(!routeToIncident.length||!routeToPrison.length)return fail("route kon niet worden berekend");
  incident.prisonId=prison.id;incident.routeToPrison=routeToPrison;incident.travelTime??=calculateTravelTime(routeToPrison);
  vehicle.status=STATUS.TO_INCIDENT;vehicle.incident=incident.id;vehicle.prison=prison.id;
  const dispatch={id,vehicleId:vehicle.id,incidentId:incident.id,phase:STATUS.TO_INCIDENT,originDistrictId:vehicle.district,incidentDistrictId:incident.district,incidentX:incident.x,incidentY:incident.y,prisonDistrictId:prison.id,routeToIncident,routeToPrison,returnRoute:getShortestRoute(prison.id,vehicle.district),phaseStartTime:performance.now(),busySeconds:incident.travelTime,fromX:vehicle.x,fromY:vehicle.y,toX:incident.x,toY:incident.y};
  incident.status="ASSIGNED";incident.vehicleId=vehicle.id;this.activeDispatches.set(id,dispatch);simulator.activeRoutes.push({id:`${id}-to-incident`,route:routeToIncident,type:"dispatch",destination:{x:incident.x,y:incident.y}});
  const events=this.ensureCoverage();return this.result(true,`[DISPATCH] ${vehicle.id} ${sessionConfig.operationMode==="manualVehicle"?"handmatig":"automatisch"} ingezet.`,{vehicle,district:getDistrictById(incident.district),events});
 }
 update(now=performance.now()){
  const events=[];
  const autoplay=simulator.autoplayState;if(sessionConfig.operationMode==="autoplay"&&autoplay.running&&!simulator.gameOver&&autoplay.nextIncidentAt!==null&&now>=autoplay.nextIncidentAt){const r=this.createIncident({automatic:true});events.push({type:"log",message:r.message});if(r.followup)events.push({type:"log",message:r.followup});events.push(...(r.events||[]));if(!simulator.gameOver)this.scheduleNextIncident(now);}
  for(const d of [...this.activeDispatches.values()])events.push(...this.updateDispatch(d,now)); for(const r of [...this.activeRepositions.values()])events.push(...this.updateReposition(r,now));
  if(!simulator.gameOver){const waiting=this.oldestOpen();if(waiting&&sessionConfig.operationMode==="autoplay"&&vehicles.some(v=>v.status===STATUS.AVAILABLE)){const result=this.assignIncident(waiting);events.push({type:"log",message:result.message},...(result.events||[]));}}
  return events;
 }
 updateDispatch(d,now){const v=vehicles.find(x=>x.id===d.vehicleId);if(!v)return[];if(d.phase===STATUS.BUSY){if((now-d.phaseStartTime)/1000<d.busySeconds)return[];this.phase(d,STATUS.RETURNING,now,d.returnRoute,getDistrictById(d.originDistrictId));v.status=STATUS.RETURNING;simulator.activeRoutes.push({id:`${d.id}-return`,route:d.returnRoute,type:"return"});return[{type:"returning",vehicle:v}];}
  const route=d.phase===STATUS.TO_INCIDENT?d.routeToIncident:d.phase===STATUS.TO_PRISON?d.routeToPrison:d.returnRoute, progress=Math.min(1,(now-d.phaseStartTime)/Math.max(900,getRouteDistance(route)*DRIVE_MS_PER_EDGE));this.move(v,route,progress,d);if(progress<1)return[];
  if(d.phase===STATUS.TO_INCIDENT){this.handleIncident(d.incidentId,now);simulator.incidentsHandled++;v.district=d.incidentDistrictId;v.status=STATUS.TO_PRISON;this.removeRoute(`${d.id}-to-incident`);this.phase(d,STATUS.TO_PRISON,now,d.routeToPrison,getDistrictById(d.prisonDistrictId));simulator.activeRoutes.push({id:`${d.id}-to-prison`,route:d.routeToPrison,type:"dispatch"});return[{type:"incidentCleared",vehicle:v,incidentId:d.incidentId},{type:"transport",vehicle:v,district:getDistrictById(d.prisonDistrictId)}];}
  if(d.phase===STATUS.TO_PRISON){v.status=STATUS.BUSY;this.removeRoute(`${d.id}-to-prison`);d.phase=STATUS.BUSY;d.phaseStartTime=now;return[{type:"prisonReached",vehicle:v,seconds:d.busySeconds}];}
  v.status=STATUS.AVAILABLE;v.incident=null;v.prison=null;v.district=d.originDistrictId;this.place(v);this.removeRoute(`${d.id}-return`);this.activeDispatches.delete(d.id);return[{type:"vehicleReturned",vehicle:v},...this.ensureCoverage()];}
 updateReposition(r,now){const v=vehicles.find(x=>x.id===r.vehicleId);if(!v)return[];const p=Math.min(1,(now-r.phaseStartTime)/Math.max(900,getRouteDistance(r.route)*DRIVE_MS_PER_EDGE));this.move(v,r.route,p,r);if(p<1)return[];v.district=r.targetDistrictId;v.status=STATUS.AVAILABLE;this.place(v);this.activeRepositions.delete(r.id);this.removeRoute(r.id);return[{type:"repositionComplete",repositionType:r.type,vehicle:v,district:getDistrictById(v.district),origin:getDistrictById(r.originDistrictId)}];}
 ensureCoverage(){if(simulator.gameOver)return[];const events=[];for(const target of districts){if(this.availableCount(target.id)||this.incoming(target.id))continue;const donor=target.neighbours.map(getDistrictById).filter(d=>d&&this.availableCount(d.id)>1).sort((a,b)=>this.availableCount(b.id)-this.availableCount(a.id))[0];if(!donor){events.push(this.triggerRepositioningFailure(target));break;}const v=vehicles.find(x=>x.district===donor.id&&x.status===STATUS.AVAILABLE),route=getShortestRoute(donor.id,target.id),id=`REP-${++this.repositionSequence}`;v.status=STATUS.REPOSITIONING;const r={id,type:"automatic",originDistrictId:donor.id,vehicleId:v.id,targetDistrictId:target.id,route,phaseStartTime:performance.now(),fromX:v.x,fromY:v.y,toX:target.x,toY:target.y};this.activeRepositions.set(id,r);simulator.activeRoutes.push({id,route,type:"reposition"});events.push({type:"repositionStarted",vehicle:v,district:target});}return events;}
 startManualReposition(){
  if(simulator.gameOver)return this.result(false,"[FOUT] Herpositioneren is niet meer mogelijk.");
  if(sessionConfig.operationMode!=="autoplay"&&(this.step!==STEPS.INCIDENT||simulator.vehicleSelection.active))return this.result(false,"[FOUT] Maak eerst de huidige melding af.");
  Object.assign(simulator.manualRepositionState,{phase:"selecting",selectedVehicleId:null,targetDistrictId:null});
  return this.result(true,"[DEKKING] Handmatige herpositioneringsmodus gestart. Kies eerst een beschikbaar voertuig.");
 }
 cancelManualReposition(){this.clearManualReposition();return this.result(true,"[DEKKING] Handmatige herpositionering geannuleerd.");}
 clearManualReposition(){Object.assign(simulator.manualRepositionState,{phase:"idle",selectedVehicleId:null,targetDistrictId:null});this.removeRoute("manual-reposition-preview");}
 handleManualRepositionAction(){return simulator.manualRepositionState.phase==="idle"?this.startManualReposition():simulator.manualRepositionState.phase==="ready"?this.confirmManualReposition():this.result(false,"[DEKKING] Kies eerst een beschikbaar voertuig en een doeldistrict.");}
 selectRepositionVehicle(vehicleId){
  const state=simulator.manualRepositionState,vehicle=vehicles.find(v=>v.id===vehicleId);
  if(state.phase==="idle")return this.result(false,"[FOUT] Start eerst ‘Herpositioneer voertuig’.");
  if(!vehicle||vehicle.status!==STATUS.AVAILABLE||vehicle.incident||[...this.activeRepositions.values()].some(r=>r.vehicleId===vehicleId))return this.result(false,`[FOUT] ${vehicleId} is niet beschikbaar.`);
  Object.assign(state,{phase:"selecting",selectedVehicleId:vehicle.id,targetDistrictId:null});this.removeRoute("manual-reposition-preview");
  return this.result(true,`[SELECTIE] ${vehicle.id} geselecteerd voor herpositionering. Kies een doeldistrict.`);
 }
 selectRepositionTarget(targetDistrictId){
  const state=simulator.manualRepositionState,vehicle=vehicles.find(v=>v.id===state.selectedVehicleId),target=getDistrictById(targetDistrictId);
  if(state.phase==="idle"||!vehicle)return this.result(false,"[FOUT] Kies eerst een beschikbaar voertuig.");
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
  if(unavailable){const vehicleId=vehicle?.id||state.selectedVehicleId;Object.assign(state,{phase:"selecting",selectedVehicleId:null,targetDistrictId:null});this.removeRoute("manual-reposition-preview");return this.result(false,`[WAARSCHUWING] ${vehicleId} is niet meer beschikbaar. Kies opnieuw een voertuig.`);}
  if(!target){Object.assign(state,{phase:"selecting",targetDistrictId:null});this.removeRoute("manual-reposition-preview");return this.result(false,"[WAARSCHUWING] Het doeldistrict is niet meer geldig. Kies opnieuw een doeldistrict.");}
  const route=getShortestRoute(vehicle.district,target.id);if(!route.length||target.id===vehicle.district){Object.assign(state,{phase:"selecting",targetDistrictId:null});this.removeRoute("manual-reposition-preview");return this.result(false,"[WAARSCHUWING] Herpositioneringsroute is niet meer geldig. Kies opnieuw een doeldistrict.");}
  const origin=getDistrictById(vehicle.district),id=`REP-${++this.repositionSequence}`;vehicle.status=STATUS.REPOSITIONING;
  const reposition={id,type:"manual",originDistrictId:origin.id,vehicleId:vehicle.id,targetDistrictId:target.id,route,phaseStartTime:performance.now(),fromX:vehicle.x,fromY:vehicle.y,toX:target.x,toY:target.y};
  this.activeRepositions.set(id,reposition);this.removeRoute("manual-reposition-preview");simulator.activeRoutes.push({id,route,type:"reposition"});this.clearManualReposition();
  return this.result(true,`[HANDMATIGE HERPOSITIONERING] ${vehicle.id} vertrekt van ${origin.name} naar ${target.name}.`,{events:[{type:"manualRepositionStarted",vehicle,district:target,origin},...this.ensureCoverage()]});
 }
 scheduleNextIncident(now=performance.now()){const delay=getRandomIncidentDelaySeconds();Object.assign(simulator.autoplayState,{nextDelaySeconds:delay,nextIncidentAt:now+delay*1000});return delay;}
 toggleAutoplay(){if(sessionConfig.operationMode!=="autoplay"||simulator.gameOver)return this.result(false,"[FOUT] Autoplay is niet actief.");const state=simulator.autoplayState;state.running=!state.running;if(state.running)this.scheduleNextIncident();else Object.assign(state,{nextIncidentAt:null,nextDelaySeconds:null});return this.result(true,`[MODUS] Autoplay ${state.running?"gestart":"gepauzeerd"}. Lopende opdrachten rijden door.`);}
 getControlState(){const blocked=simulator.gameOver,mode=sessionConfig.operationMode,autoplay=mode==="autoplay",manual=mode==="manualVehicle",selecting=simulator.vehicleSelection.active,repositionState=simulator.manualRepositionState,repositioning=repositionState.phase!=="idle";return{incident:!blocked&&!autoplay&&this.step===STEPS.INCIDENT,prison:!blocked&&!autoplay&&this.step===STEPS.PRISON,travelTime:!blocked&&!autoplay&&this.step===STEPS.TRAVEL_TIME,dispatch:!blocked&&mode==="automatic"&&this.step===STEPS.DISPATCH,selectVehicle:!blocked&&manual&&this.step===STEPS.DISPATCH&&!selecting,confirmVehicle:!blocked&&manual&&selecting&&!!simulator.selectedVehicleId&&!simulator.vehicleSelection.confirming,autoplayToggle:!blocked&&autoplay,reset:true,currentStep:this.step,gameOver:simulator.gameOver,mode,autoplayRunning:simulator.autoplayState.running,vehicleSelectionActive:selecting,manualRepositionActive:repositioning,manualRepositionPhase:repositionState.phase,manualRepositionStart:!blocked&&(repositioning||(autoplay||this.step===STEPS.INCIDENT)&&!selecting),manualRepositionConfirm:!blocked&&repositionState.phase==="ready"};}
 reset(o={}){Object.assign(simulator,{activeIncident:null,selectedPrison:null,travelTime:null,incidentsHandled:0,gameOver:false,activeRoute:[],activeRoutes:[],incidentHistory:[],repositioningFailure:null,incidents:[],selectedVehicleId:null,vehicleSelection:{active:false,incidentId:null,selectedVehicleId:null,confirming:false},inputCycleState:{step:STEPS.INCIDENT,incidentId:null,prisonId:null,travelTime:null,selectedVehicleId:null,selectionActive:false},manualRepositionState:{phase:"idle",selectedVehicleId:null,targetDistrictId:null},autoplayState:{running:false,nextIncidentAt:null,nextDelaySeconds:null}});if(o.restoreDefaults)resetSessionConfigDefaults();if(o.availablePrisons)setAvailablePrisons(o.availablePrisons);if(o.vehiclesPerDistrict)setVehiclesPerDistrict(o.vehiclesPerDistrict);if(o.operationMode)sessionConfig.operationMode=o.operationMode;initializeVehicles();this.activeDispatches.clear();this.activeRepositions.clear();this.step=STEPS.INCIDENT;return this.result(true,sessionConfig.operationMode==="autoplay"?"[MODUS] Autoplay klaar — druk op Play.":"[RESET] Nieuwe oefening gestart.");}
 triggerRepositioningFailure(d){this.clearVehicleSelection();this.clearManualReposition();simulator.gameOver=true;Object.assign(simulator.autoplayState,{running:false,nextIncidentAt:null,nextDelaySeconds:null});simulator.repositioningFailure={districtName:d.name,coveragePercentage:this.calculateCoveragePercentage(),availableVehicles:vehicles.filter(v=>v.status===STATUS.AVAILABLE).length,title:repositioningFailureConfig.title,explanation:repositioningFailureConfig.explanation};return{type:"repositioningFailure",failure:simulator.repositioningFailure};}
 // Queue policy only: interactive Automatic and Manual Vehicle flows use inputCycleState.incidentId.
 oldestOpen(){return simulator.incidents.filter(i=>i.status==="OPEN").sort((a,b)=>a.createdAt-b.createdAt)[0]||null;} availableCount(id){return vehicles.filter(v=>v.district===id&&v.status===STATUS.AVAILABLE).length;} incoming(id){return[...this.activeRepositions.values()].some(r=>r.targetDistrictId===id);} calculateCoveragePercentage(){return Math.round(districts.filter(d=>this.availableCount(d.id)||this.incoming(d.id)).length/districts.length*100);} projectedCoverage(v){return Math.round(districts.filter(d=>d.id===v.district?this.availableCount(d.id)>1:this.availableCount(d.id)>0).length/districts.length*100);}
 phase(d,s,now,route,target){d.phase=s;d.phaseStartTime=now;d.fromX=vehicles.find(v=>v.id===d.vehicleId).x;d.fromY=vehicles.find(v=>v.id===d.vehicleId).y;d.toX=target.x;d.toY=target.y;}
 move(v,route,p,c){const pts=route.map(getDistrictById).filter(Boolean);if(pts.length<2)pts.push({x:c.toX,y:c.toY});pts[0]={x:c.fromX,y:c.fromY};pts[pts.length-1]={x:c.toX,y:c.toY};const q=p*(pts.length-1),i=Math.min(Math.floor(q),pts.length-2),f=q-i,oldX=v.x,oldY=v.y;v.x=pts[i].x+(pts[i+1].x-pts[i].x)*f;v.y=pts[i].y+(pts[i+1].y-pts[i].y)*f;v.angle=Math.atan2(v.y-oldY,v.x-oldX)*180/Math.PI;}
 place(v){const d=getDistrictById(v.district);v.x=d.x;v.y=d.y;} removeRoute(id){simulator.activeRoutes=simulator.activeRoutes.filter(r=>r.id!==id);} random(a){return a[Math.floor(Math.random()*a.length)];} result(success,message,data={}){return{success,message,...data};}
 handleIncident(id,handledAt){const index=simulator.incidents.findIndex(i=>i.id===id);if(index<0)return;const incident=simulator.incidents[index];incident.status="HANDLED";incident.handledAt=handledAt;simulator.incidentHistory.push({...incident});if(simulator.activeIncident?.id===id)simulator.activeIncident=null;}
 nearestDistrict(point){return districts.reduce((nearest,district)=>Math.hypot(point.x-district.x,point.y-district.y)<Math.hypot(point.x-nearest.x,point.y-nearest.y)?district:nearest,districts[0]);}
 createIncidentPosition(){const xs=INCIDENT_SPAWN_POLYGON.map(p=>p.x),ys=INCIDENT_SPAWN_POLYGON.map(p=>p.y),bounds={minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)};let best=null,bestDistance=-1,validAttempts=0,totalAttempts=0;while(validAttempts<20&&totalAttempts++<200){const candidate={x:Math.round(bounds.minX+Math.random()*(bounds.maxX-bounds.minX)),y:Math.round(bounds.minY+Math.random()*(bounds.maxY-bounds.minY))};if(!pointInPolygon(candidate)||distanceToPolygonEdge(candidate)<INCIDENT_MARGIN)continue;validAttempts++;const distance=simulator.incidents.length?Math.min(...simulator.incidents.map(i=>Math.hypot(candidate.x-i.x,candidate.y-i.y))):Infinity;if(distance>=INCIDENT_MIN_DISTANCE)return candidate;if(distance>bestDistance){best=candidate;bestDistance=distance;}}return best||{x:550,y:350};}
}
