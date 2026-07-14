export const VEHICLE_STATUS = Object.freeze({
    AVAILABLE: "available",
    DISPATCHED: "dispatched",
    TO_PRISON: "to_prison",
    BUSY: "busy",
    RETURNING: "returning",
    REPOSITIONING: "repositioning"
});

export const REPOSITIONING = Object.freeze({
    MAX_STEPS_PER_CYCLE: 7,
    ANIMATION_SECONDS: 4
});

export const districts = [
    { id: "RN", name: "Rijnmond-Noord", x: 455, y: 105, prison: false, neighbours: ["ZH", "RS", "RO"] },
    { id: "ZH", name: "Zeehaven", x: 235, y: 250, prison: true, neighbours: ["RN", "RS", "RZW"] },
    { id: "RS", name: "Rotterdam-Stad", x: 505, y: 245, prison: true, neighbours: ["RN", "ZH", "RO", "RZ"] },
    { id: "RO", name: "Rijnmond-Oost", x: 760, y: 250, prison: false, neighbours: ["RN", "RS", "RZ"] },
    { id: "RZW", name: "Rijnmond-Zuidwest", x: 270, y: 470, prison: false, neighbours: ["ZH", "RZ", "ZHZ"] },
    { id: "RZ", name: "Rotterdam-Zuid", x: 560, y: 430, prison: false, neighbours: ["RS", "RO", "RZW", "ZHZ"] },
    { id: "ZHZ", name: "Zuid-Holland-Zuid", x: 600, y: 650, prison: false, neighbours: ["RZW", "RZ"] }
];

export const vehicles = [];

export const simulator = {
    activeIncident: null,
    selectedPrison: null,
    travelTime: null,
    score: 0,
    incidentsHandled: 0,
    openIncidents: 0,
    gameOver: false
};

export const colors = {
    RN: "#00AEEF",
    ZH: "#0072BC",
    RS: "#F7941D",
    RO: "#8CC63E",
    RZ: "#ED1C24",
    RZW: "#8E44AD",
    ZHZ: "#00BFA5"
};

export function buildInitialVehicles() {
    vehicles.length = 0;
    districts.forEach(district => {
        for (let i = 1; i <= 3; i++) {
            vehicles.push({
                id: `${district.id}-${String(i).padStart(2, "0")}`,
                district: district.id,
                homeDistrict: district.id,
                status: VEHICLE_STATUS.AVAILABLE,
                x: district.x,
                y: district.y,
                targetX: district.x,
                targetY: district.y,
                speed: 90,
                incident: null,
                prison: null,
                timer: null
            });
        }
    });
}

buildInitialVehicles();

export function resetSimulator() {
    simulator.activeIncident = null;
    simulator.selectedPrison = null;
    simulator.travelTime = null;
    simulator.score = 0;
    simulator.incidentsHandled = 0;
    simulator.openIncidents = 0;
    simulator.gameOver = false;
    buildInitialVehicles();
}

export function getDistrict(id) {
    return districts.find(d => d.id === id);
}

export function getAvailableVehicles() {
    return vehicles.filter(vehicle => vehicle.status === VEHICLE_STATUS.AVAILABLE);
}

export function getAvailableVehiclesInDistrict(id) {
    return vehicles.filter(vehicle => vehicle.district === id && vehicle.status === VEHICLE_STATUS.AVAILABLE);
}

export function getCoverage() {
    const covered = districts.filter(district => getAvailableVehiclesInDistrict(district.id).length > 0).length;
    return Math.round((covered / districts.length) * 100);
}
