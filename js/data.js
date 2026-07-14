export const districts = [
    { id: "RN", name: "Rijnmond-Noord", x: 455, y: 105, prison: false, neighbours: ["ZH", "RS", "RO"] },
    { id: "ZH", name: "Zeehaven", x: 235, y: 250, prison: true, neighbours: ["RN", "RS", "RZW"] },
    { id: "RS", name: "Rotterdam-Stad", x: 505, y: 245, prison: true, neighbours: ["RN", "ZH", "RO", "RZ"] },
    { id: "RO", name: "Rijnmond-Oost", x: 760, y: 250, prison: false, neighbours: ["RN", "RS", "RZ"] },
    { id: "RZW", name: "Rijnmond-Zuidwest", x: 270, y: 470, prison: false, neighbours: ["ZH", "RZ", "ZHZ"] },
    { id: "RZ", name: "Rotterdam-Zuid", x: 560, y: 430, prison: false, neighbours: ["RS", "RO", "RZW", "ZHZ"] },
    { id: "ZHZ", name: "Zuid-Holland-Zuid", x: 600, y: 650, prison: false, neighbours: ["RZW", "RZ"] }
];

export const colors = { RN: "#00AEEF", ZH: "#0072BC", RS: "#F7941D", RO: "#8CC63E", RZ: "#ED1C24", RZW: "#8E44AD", ZHZ: "#00BFA5" };
export const vehicles = [];
export const simulator = {
    activeIncident: null, selectedPrison: null, travelTime: null, gameOver: false,
    startTime: performance.now(), incidents: [], settings: { vehiclesPerDistrict: 3, animations: true, log: true, routes: true, showIds: true },
    stats: { totalIncidents: 0, handledIncidents: 0, responseTotal: 0, prisonTravelTotal: 0, repositions: 0, longestRepositionChain: 0, missionFailed: 0 }
};

export function getDistrict(id) { return districts.find(district => district.id === id) || null; }
export function getAvailableVehicles() { return vehicles.filter(vehicle => vehicle.status === "available"); }
export function getVehiclesInDistrict(id) { return vehicles.filter(vehicle => vehicle.district === id && vehicle.status === "available"); }

export function resetVehicles(perDistrict = simulator.settings.vehiclesPerDistrict) {
    vehicles.splice(0, vehicles.length);
    districts.forEach(district => {
        for (let i = 1; i <= perDistrict; i += 1) {
            vehicles.push({
                id: `${district.id}-${String(i).padStart(2, "0")}`,
                district: district.id,
                homeDistrict: district.id,
                status: "available",
                x: district.x,
                y: district.y,
                targetX: district.x,
                targetY: district.y,
                angle: 0,
                timerId: null,
                route: [],
                routeColor: "#2da8ff"
            });
        }
    });
}

export function resetSimulatorStats() {
    simulator.activeIncident = null;
    simulator.selectedPrison = null;
    simulator.travelTime = null;
    simulator.gameOver = false;
    simulator.startTime = performance.now();
    simulator.incidents = [];
    simulator.stats = { totalIncidents: 0, handledIncidents: 0, responseTotal: 0, prisonTravelTotal: 0, repositions: 0, longestRepositionChain: 0, missionFailed: 0 };
}

resetVehicles();
