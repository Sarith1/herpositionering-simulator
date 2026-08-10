import { detentionComplexes, districts, initializeVehicles, resetSessionConfigDefaults, repositioningFailureConfig, sessionConfig, setAvailablePrisons, setVehiclesPerDistrict, simulator, vehicles } from "./data.js";
import { calculateTravelTime, findNearestAvailableVehicle, getDistrictById, getPrisonDistricts, getRouteDistance, getShortestRoute } from "./routing.js";

const STATUS = { AVAILABLE:"AVAILABLE", TO_INCIDENT:"TO_INCIDENT", TO_PRISON:"TO_PRISON", BUSY:"BUSY", RETURNING:"RETURNING", REPOSITIONING:"REPOSITIONING" };
const STEPS = { INCIDENT:"incident", PRISON:"prison", TRAVEL_TIME:"travelTime", DISPATCH:"dispatch" };
const DRIVE_MS_PER_EDGE = 1400;
export const INCIDENT_MARGIN = 38;
export const INCIDENT_MIN_DISTANCE = 45;
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
 createIncident(options={}) {
  if(simulator.gameOver) return this.result(false,"[FOUT] De oefening is geblokkeerd.");
  const autoplay=options.automatic || sessionConfig.operationMode==="autoplay";
  if(!autoplay&&this.step!==STEPS.INCIDENT)return this.result(false,"[FOUT] Maak eerst de huidige knopcyclus af.");
  const position=this.createIncidentPosition(),district=this.nearestDistrict(position), incident={id:`INC-${Date.now()}-${++this.sequence}`,district:district.id,districtId:district.id,x:position.x,y:position.y,status:"OPEN",createdAt:performance.now(),prisonId:null,travelTime:null};
  simulator.incidents.push(incident); simulator.activeIncident=incident;
  let dispatchResult=null;
  if(autoplay){this.prepareIncident(incident);dispatchResult=this.assignIncident(incident);}
  else this.step=STEPS.PRISON;
  return this.result(true,`[MELDING] Nieuwe ${options.automatic ? "automatische " : ""}melding in ${district.name}.`,{district,events:dispatchResult?.events||[],followup:dispatchResult?.message});
 }
 prepareIncident(incident){
  const prisons=getPrisonDistricts(); if(!prisons.length) return;
  const ranked=prisons.map(prison=>({prison,route:getShortestRoute(incident.district,prison.id)})).filter(x=>x.route.length).sort((a,b)=>getRouteDistance(a.route)-getRouteDistance(b.route));
  const choice=ranked[0]; incident.prisonId=choice.prison.id; incident.routeToPrison=choice.route; incident.travelTime=calculateTravelTime(choice.route); simulator.selectedPrison=choice.prison.id; simulator.activeRoute=choice.route;
 }
 selectPrison(){ if(this.step!==STEPS.PRISON)return this.result(false,"[FOUT] Plaats eerst een melding.");const i=simulator.activeIncident;if(!i)return this.result(false,"[FOUT] Plaats eerst een melding.");this.prepareIncident(i);this.step=STEPS.TRAVEL_TIME;return this.result(true,`[CEL] ${getDistrictById(i.prisonId)?.name} geselecteerd.`); }
 calculateTravelTime(){ if(this.step!==STEPS.TRAVEL_TIME)return this.result(false,"[FOUT] Selecteer eerst een cel.");const i=simulator.activeIncident;if(!i?.prisonId)return this.result(false,"[FOUT] Selecteer eerst een cel.");this.step=STEPS.DISPATCH;return this.result(true,`[REISTIJD] Geschatte reistijd: ${i.travelTime} seconden.`); }
 selectVehicle(vehicleId){
  if(sessionConfig.operationMode!=="manualVehicle")return this.result(false,"[FOUT] Voertuigkeuze is alleen beschikbaar in handmatige modus.");
  const vehicle=vehicles.find(v=>v.id===vehicleId), incident=this.oldestOpen();
  if(!vehicle||vehicle.status!==STATUS.AVAILABLE)return this.result(false,`[FOUT] ${vehicleId} is niet inzetbaar.`);
  if(!incident)return this.result(false,"[FOUT] Er is geen open melding.");
  simulator.selectedVehicleId=vehicle.id; simulator.activeIncident=incident;
  const route=getShortestRoute(vehicle.district,incident.district), remaining=this.availableCount(vehicle.district)-1;
  return this.result(true,`[SELECTIE] ${vehicle.id} geselecteerd.`,{selection:{vehicleId:vehicle.id,district:getDistrictById(vehicle.district)?.name,distance:getRouteDistance(route),eta:Math.max(1,getRouteDistance(route)*10),remaining,coverage:this.projectedCoverage(vehicle)}});
 }
 cancelVehicleSelection(){ simulator.selectedVehicleId=null; return this.result(true,"[SELECTIE] Voertuigselectie geannuleerd."); }
 dispatchVehicle(){ if(sessionConfig.operationMode!=="autoplay"&&this.step!==STEPS.DISPATCH)return this.result(false,"[FOUT] Bereken eerst de reistijd met knop 3.");const incident=this.oldestOpen();if(!incident)return this.result(false,"[FOUT] Er is geen open melding.");const selected=sessionConfig.operationMode==="manualVehicle"?simulator.selectedVehicleId:null;if(sessionConfig.operationMode==="manualVehicle"&&!selected)return this.result(false,"[FOUT] Selecteer eerst een beschikbaar voertuig op de kaart.");return this.assignIncident(incident,selected); }
 assignIncident(incident,vehicleId=null){
  if(!incident?.prisonId)this.prepareIncident(incident);
  const nearest=vehicleId?{vehicle:vehicles.find(v=>v.id===vehicleId),route:getShortestRoute(vehicles.find(v=>v.id===vehicleId)?.district,incident.district)}:findNearestAvailableVehicle(vehicles,incident.district);
  if(!nearest.vehicle||nearest.vehicle.status!==STATUS.AVAILABLE){ incident.status="WAITING"; return this.result(false,`[WACHT] Melding ${getDistrictById(incident.district)?.name} wacht op beschikbaar voertuig.`); }
  const v=nearest.vehicle, prison=getDistrictById(incident.prisonId), id=`DSP-${incident.id}`; v.status=STATUS.TO_INCIDENT;v.incident=incident.id;v.prison=incident.prisonId;
  const dispatch={id,vehicleId:v.id,incidentId:incident.id,phase:STATUS.TO_INCIDENT,originDistrictId:v.district,incidentDistrictId:incident.district,incidentX:incident.x,incidentY:incident.y,prisonDistrictId:incident.prisonId,routeToIncident:nearest.route,routeToPrison:incident.routeToPrison,returnRoute:getShortestRoute(incident.prisonId,v.district),phaseStartTime:performance.now(),busySeconds:incident.travelTime,fromX:v.x,fromY:v.y,toX:incident.x,toY:incident.y};
  incident.status="ASSIGNED";incident.vehicleId=v.id;this.activeDispatches.set(id,dispatch);simulator.activeRoutes.push({id,route:nearest.route,type:"dispatch",destination:{x:incident.x,y:incident.y}});simulator.selectedVehicleId=null;this.step="incident";
  const events=this.ensureCoverage(); return this.result(true,`[DISPATCH] ${v.id} ${sessionConfig.operationMode==="manualVehicle"?"handmatig":"automatisch"} ingezet.`,{vehicle:v,district:getDistrictById(incident.district),events});
 }
 update(now=performance.now()){
  const events=[];
  if(sessionConfig.operationMode==="autoplay"&&!simulator.autoplayPaused&&!simulator.gameOver&&simulator.nextIncidentAt!==null&&now>=simulator.nextIncidentAt){const r=this.createIncident({automatic:true});events.push({type:"log",message:r.message});if(r.followup)events.push({type:"log",message:r.followup});events.push(...(r.events||[]));simulator.nextIncidentAt=now+sessionConfig.autoplayIntervalSeconds*1000;}
  for(const d of [...this.activeDispatches.values()])events.push(...this.updateDispatch(d,now)); for(const r of [...this.activeRepositions.values()])events.push(...this.updateReposition(r,now));
  if(!simulator.gameOver){const waiting=this.oldestOpen();if(waiting&&sessionConfig.operationMode==="autoplay"&&vehicles.some(v=>v.status===STATUS.AVAILABLE)){const result=this.assignIncident(waiting);events.push({type:"log",message:result.message},...(result.events||[]));}}
  return events;
 }
 updateDispatch(d,now){const v=vehicles.find(x=>x.id===d.vehicleId);if(!v)return[];if(d.phase===STATUS.BUSY){if((now-d.phaseStartTime)/1000<d.busySeconds)return[];this.phase(d,STATUS.RETURNING,now,d.returnRoute,getDistrictById(d.originDistrictId));v.status=STATUS.RETURNING;simulator.activeRoutes.push({id:`${d.id}-return`,route:d.returnRoute,type:"return"});return[{type:"returning",vehicle:v}];}
  const route=d.phase===STATUS.TO_INCIDENT?d.routeToIncident:d.phase===STATUS.TO_PRISON?d.routeToPrison:d.returnRoute, progress=Math.min(1,(now-d.phaseStartTime)/Math.max(900,getRouteDistance(route)*DRIVE_MS_PER_EDGE));this.move(v,route,progress,d);if(progress<1)return[];
  if(d.phase===STATUS.TO_INCIDENT){this.handleIncident(d.incidentId,now);simulator.incidentsHandled++;v.district=d.incidentDistrictId;v.status=STATUS.TO_PRISON;this.removeRoute(d.id);this.phase(d,STATUS.TO_PRISON,now,d.routeToPrison,getDistrictById(d.prisonDistrictId));simulator.activeRoutes.push({id:d.id,route:d.routeToPrison,type:"dispatch"});return[{type:"incidentCleared",vehicle:v,incidentId:d.incidentId},{type:"transport",vehicle:v,district:getDistrictById(d.prisonDistrictId)}];}
  if(d.phase===STATUS.TO_PRISON){v.status=STATUS.BUSY;this.removeRoute(d.id);d.phase=STATUS.BUSY;d.phaseStartTime=now;return[{type:"prisonReached",vehicle:v,seconds:d.busySeconds}];}
  v.status=STATUS.AVAILABLE;v.incident=null;v.prison=null;v.district=d.originDistrictId;this.place(v);this.removeRoute(`${d.id}-return`);this.activeDispatches.delete(d.id);return[{type:"vehicleReturned",vehicle:v},...this.ensureCoverage()];}
 updateReposition(r,now){const v=vehicles.find(x=>x.id===r.vehicleId);if(!v)return[];const p=Math.min(1,(now-r.phaseStartTime)/Math.max(900,getRouteDistance(r.route)*DRIVE_MS_PER_EDGE));this.move(v,r.route,p,r);if(p<1)return[];v.district=r.targetDistrictId;v.status=STATUS.AVAILABLE;this.place(v);this.activeRepositions.delete(r.id);this.removeRoute(r.id);return[{type:"repositionComplete",vehicle:v,district:getDistrictById(v.district)}];}
 ensureCoverage(){if(simulator.gameOver)return[];const events=[];for(const target of districts){if(this.availableCount(target.id)||this.incoming(target.id))continue;const donor=target.neighbours.map(getDistrictById).filter(d=>d&&this.availableCount(d.id)>1).sort((a,b)=>this.availableCount(b.id)-this.availableCount(a.id))[0];if(!donor){events.push(this.triggerRepositioningFailure(target));break;}const v=vehicles.find(x=>x.district===donor.id&&x.status===STATUS.AVAILABLE),route=getShortestRoute(donor.id,target.id),id=`REP-${++this.repositionSequence}`;v.status=STATUS.REPOSITIONING;const r={id,vehicleId:v.id,targetDistrictId:target.id,route,phaseStartTime:performance.now(),fromX:v.x,fromY:v.y,toX:target.x,toY:target.y};this.activeRepositions.set(id,r);simulator.activeRoutes.push({id,route,type:"reposition"});events.push({type:"repositionStarted",vehicle:v,district:target});}return events;}
 toggleAutoplay(paused){if(sessionConfig.operationMode!=="autoplay")return this.result(false,"[FOUT] Autoplay is niet actief.");simulator.autoplayPaused=paused;if(!paused)simulator.nextIncidentAt=performance.now()+sessionConfig.autoplayIntervalSeconds*1000;return this.result(true,`[MODUS] Autoplay ${paused?"gepauzeerd":"hervat"}. Lopende opdrachten rijden door.`);}
 getControlState(){const blocked=simulator.gameOver,autoplay=sessionConfig.operationMode==="autoplay";return{incident:!blocked&&!autoplay&&this.step===STEPS.INCIDENT,prison:!blocked&&!autoplay&&this.step===STEPS.PRISON,travelTime:!blocked&&!autoplay&&this.step===STEPS.TRAVEL_TIME,dispatch:!blocked&&!autoplay&&this.step===STEPS.DISPATCH&&(sessionConfig.operationMode!=="manualVehicle"||!!simulator.selectedVehicleId),reset:true,currentStep:this.step,gameOver:simulator.gameOver,mode:sessionConfig.operationMode,autoplayPaused:simulator.autoplayPaused};}
 reset(o={}){Object.assign(simulator,{activeIncident:null,selectedPrison:null,travelTime:null,incidentsHandled:0,gameOver:false,activeRoute:[],activeRoutes:[],incidentHistory:[],repositioningFailure:null,incidents:[],selectedVehicleId:null,autoplayPaused:false,nextIncidentAt:null});if(o.restoreDefaults)resetSessionConfigDefaults();if(o.availablePrisons)setAvailablePrisons(o.availablePrisons);if(o.vehiclesPerDistrict)setVehiclesPerDistrict(o.vehiclesPerDistrict);if(o.operationMode)sessionConfig.operationMode=o.operationMode;if(o.autoplayIntervalSeconds)sessionConfig.autoplayIntervalSeconds=Math.max(1,Math.min(20,+o.autoplayIntervalSeconds));initializeVehicles();this.activeDispatches.clear();this.activeRepositions.clear();this.step="incident";if(sessionConfig.operationMode==="autoplay")simulator.nextIncidentAt=performance.now()+sessionConfig.autoplayIntervalSeconds*1000;return this.result(true,sessionConfig.operationMode==="autoplay"?`[MODUS] Autoplay gestart — interval ${sessionConfig.autoplayIntervalSeconds} seconden.`:"[RESET] Nieuwe oefening gestart.");}
 triggerRepositioningFailure(d){simulator.gameOver=true;simulator.nextIncidentAt=null;simulator.autoplayPaused=false;simulator.repositioningFailure={districtName:d.name,coveragePercentage:this.calculateCoveragePercentage(),availableVehicles:vehicles.filter(v=>v.status===STATUS.AVAILABLE).length,title:repositioningFailureConfig.title,explanation:repositioningFailureConfig.explanation};return{type:"repositioningFailure",failure:simulator.repositioningFailure};}
 oldestOpen(){return simulator.incidents.filter(i=>i.status==="OPEN"||i.status==="WAITING").sort((a,b)=>a.createdAt-b.createdAt)[0]||null;} availableCount(id){return vehicles.filter(v=>v.district===id&&v.status===STATUS.AVAILABLE).length;} incoming(id){return[...this.activeRepositions.values()].some(r=>r.targetDistrictId===id);} calculateCoveragePercentage(){return Math.round(districts.filter(d=>this.availableCount(d.id)||this.incoming(d.id)).length/districts.length*100);} projectedCoverage(v){return Math.round(districts.filter(d=>d.id===v.district?this.availableCount(d.id)>1:this.availableCount(d.id)>0).length/districts.length*100);}
 phase(d,s,now,route,target){d.phase=s;d.phaseStartTime=now;d.fromX=vehicles.find(v=>v.id===d.vehicleId).x;d.fromY=vehicles.find(v=>v.id===d.vehicleId).y;d.toX=target.x;d.toY=target.y;}
 move(v,route,p,c){const pts=route.map(getDistrictById).filter(Boolean);if(pts.length<2)pts.push({x:c.toX,y:c.toY});pts[0]={x:c.fromX,y:c.fromY};pts[pts.length-1]={x:c.toX,y:c.toY};const q=p*(pts.length-1),i=Math.min(Math.floor(q),pts.length-2),f=q-i,oldX=v.x,oldY=v.y;v.x=pts[i].x+(pts[i+1].x-pts[i].x)*f;v.y=pts[i].y+(pts[i+1].y-pts[i].y)*f;v.angle=Math.atan2(v.y-oldY,v.x-oldX)*180/Math.PI;}
 place(v){const d=getDistrictById(v.district);v.x=d.x;v.y=d.y;} removeRoute(id){simulator.activeRoutes=simulator.activeRoutes.filter(r=>r.id!==id);} random(a){return a[Math.floor(Math.random()*a.length)];} result(success,message,data={}){return{success,message,...data};}
 handleIncident(id,handledAt){const index=simulator.incidents.findIndex(i=>i.id===id);if(index<0)return;const incident=simulator.incidents[index];incident.status="HANDLED";incident.handledAt=handledAt;simulator.incidentHistory.push({...incident});simulator.incidents.splice(index,1);if(simulator.activeIncident?.id===id)simulator.activeIncident=this.oldestOpen();}
 nearestDistrict(point){return districts.reduce((nearest,district)=>Math.hypot(point.x-district.x,point.y-district.y)<Math.hypot(point.x-nearest.x,point.y-nearest.y)?district:nearest,districts[0]);}
 createIncidentPosition(){const xs=INCIDENT_SPAWN_POLYGON.map(p=>p.x),ys=INCIDENT_SPAWN_POLYGON.map(p=>p.y),bounds={minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)};let best=null,bestDistance=-1,validAttempts=0,totalAttempts=0;while(validAttempts<20&&totalAttempts++<200){const candidate={x:Math.round(bounds.minX+Math.random()*(bounds.maxX-bounds.minX)),y:Math.round(bounds.minY+Math.random()*(bounds.maxY-bounds.minY))};if(!pointInPolygon(candidate)||distanceToPolygonEdge(candidate)<INCIDENT_MARGIN)continue;validAttempts++;const distance=simulator.incidents.length?Math.min(...simulator.incidents.map(i=>Math.hypot(candidate.x-i.x,candidate.y-i.y))):Infinity;if(distance>=INCIDENT_MIN_DISTANCE)return candidate;if(distance>bestDistance){best=candidate;bestDistance=distance;}}return best||{x:550,y:350};}
}
