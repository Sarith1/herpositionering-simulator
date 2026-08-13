/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.5
Bestand: data.js

Bevat:
- Districten
- Voertuigen
- Gevangenissen
- Routenetwerk
==========================================================
*/

export const districts = [

    {
        id: "RN",
        name: "Rijnmond-Noord",

        x: 500,
        y: 165,

        prison: false,

        neighbours: [
            "ZH",
            "RS",
            "RO"
        ]
    },

    {
        id: "ZH",
        name: "Zeehaven",

        x: 255,
        y: 225,

        prison: false,

        neighbours: [
            "RN",
            "RS",
            "RZW"
        ]
    },

    {
        id: "RS",
        name: "Rotterdam-Stad",

        x: 590,
        y: 285,

        prison: true,

        neighbours: [
            "RN",
            "ZH",
            "RO",
            "RZ"
        ]
    },

    {
        id: "RO",
        name: "Rijnmond-Oost",

        x: 780,
        y: 360,

        prison: false,

        neighbours: [
            "RN",
            "RS",
            "RZ"
        ]
    },

    {
        id: "RZW",
        name: "Rijnmond-Zuidwest",

        x: 295,
        y: 430,

        prison: false,

        neighbours: [
            "ZH",
            "RZ",
            "ZHZ"
        ]
    },

    {
        id: "RZ",
        name: "Rotterdam-Zuid",

        x: 470,
        y: 415,

        prison: false,

        neighbours: [
            "RS",
            "RO",
            "RZW",
            "ZHZ"
        ]
    },

    {
        id: "ZHZ",
        name: "Zuid-Holland-Zuid",

        x: 670,
        y: 500,

        prison: true,

        neighbours: [
            "RZW",
            "RZ"
        ]
    }

];


/*
==========================================================
Voertuigen
==========================================================
*/

export const DEFAULT_VEHICLES_PER_DISTRICT = 3;
export const VEHICLE_CALLSIGNS = Object.freeze({
    RN: Object.freeze(["RT1101", "RT1201", "RT1301", "RT1303", "RT1102", "RT1202", "RT1302", "RT1309"]),
    RS: Object.freeze(["RT2201", "RT2202", "RT2291"]),
    RO: Object.freeze(["RT3201", "RT3202", "RT3204", "RT3203", "RT3209"]),
    RZ: Object.freeze(["RT4101", "RT4201", "RT4301", "RT4102", "RT4202", "RT4302", "RT4309"]),
    RZW: Object.freeze(["RT5103", "RT5101", "RT5201", "RT5301", "RT5102", "RT5202", "RT5303", "RT5309"]),
    ZHZ: Object.freeze(["RT6101", "RT6201", "RT6301", "RT6401", "RT6102", "RT6202", "RT6302", "RT6402", "RT6209", "RT6309", "RT6409"]),
    ZH: Object.freeze(["RT7202", "RT7101", "RT7201", "RT7109"])
});
export const SPECIAL_VEHICLE_CALLSIGNS = new Set([
    "RT1101",
    "RT5103"
]);
export const DEFAULT_MULTI_UNIT_INCIDENT_PERCENTAGE = 20;
export const DEFAULT_HOTZONE_INCIDENT_PERCENTAGE = 50;
export const DEFAULT_AUTOPLAY_MIN_DELAY_SECONDS = 1;
export const DEFAULT_AUTOPLAY_MAX_DELAY_SECONDS = 20;
export const DEFAULT_DETENTION_CAPACITY = 10;
export const MAX_DETENTION_CAPACITY = 50;
export const DETENTION_COMPLEX_OFFSET_X = 40;
export const DETENTION_COMPLEX_OFFSET_Y = -62;
export const DETENTION_COMPLEX_MAP_WIDTH = 1100;
export const DETENTION_COMPLEX_SAFE_MARGIN = 48;

// Cellencomplexen zijn zelfstandige routenetwerknodes. De centrale locatie ligt
// bewust iets ten westen van het kaartmidden om labels en voertuigclusters vrij te houden.
export const detentionComplexes = [
    { id: "CELL_RS", name: "Cellencomplex Rotterdam-Stad", x: 590, y: 223, neighbours: ["RS", "RN"] },
    { id: "CELL_ZHZ", name: "Cellencomplex Zuid-Holland-Zuid", x: 670, y: 438, neighbours: ["ZHZ", "RZ"] },
    { id: "CELL_CENTRAL", name: "Centraal Cellencomplex", x: 410, y: 315, neighbours: ["RS", "RZ", "ZH"] }
];

export function getDetentionComplexPosition(complex) {
    if (!complex) return null;
    return {
        x: Math.min(complex.x + DETENTION_COMPLEX_OFFSET_X, DETENTION_COMPLEX_MAP_WIDTH - DETENTION_COMPLEX_SAFE_MARGIN),
        y: complex.y + DETENTION_COMPLEX_OFFSET_Y
    };
}

export function getDetentionComplexPositionById(id) {
    return getDetentionComplexPosition(detentionComplexes.find(complex => complex.id === id));
}

const DETENTION_PARKING_OFFSETS = [
    { x: 0, y: 30 }, { x: 22, y: 25 }, { x: -22, y: 25 },
    { x: 32, y: 0 }, { x: -32, y: 0 }
];

export function getDetentionParkingSlot(complexId, vehicleId) {
    const position = getDetentionComplexPositionById(complexId);
    if (!position) return null;
    const slotIndex = [...String(vehicleId)].reduce((hash, character) => hash + character.charCodeAt(0), 0);
    const offset = DETENTION_PARKING_OFFSETS[slotIndex % DETENTION_PARKING_OFFSETS.length];
    return { x: position.x + offset.x, y: position.y + offset.y };
}

export function createDefaultDetentionCapacity() {
    return Object.fromEntries(detentionComplexes.map(complex => [complex.id, DEFAULT_DETENTION_CAPACITY]));
}

export function createEmptyDetentionOccupancy() {
    return Object.fromEntries(detentionComplexes.map(complex => [complex.id, 0]));
}

export const sessionConfig = {

    vehiclesPerDistrict: createDefaultVehiclesPerDistrict(),
    hotzoneDistrictIds: [],
    hotzoneIncidentPercentage: DEFAULT_HOTZONE_INCIDENT_PERCENTAGE,

    availablePrisons: getDefaultPrisonDistrictIds(),
    detentionCapacity: createDefaultDetentionCapacity(),
    operationMode: "automatic",
    multiUnitIncidentPercentage: DEFAULT_MULTI_UNIT_INCIDENT_PERCENTAGE,
    autoplayMinDelaySeconds: DEFAULT_AUTOPLAY_MIN_DELAY_SECONDS,
    autoplayMaxDelaySeconds: DEFAULT_AUTOPLAY_MAX_DELAY_SECONDS

};

export const repositioningFailureConfig = {
    title: "Herpositioneren is niet meer mogelijk",
    explanation: "Er is geen aangrenzend district dat veilig een voertuig kan afstaan. De gebiedsdekking kan niet meer worden hersteld."
};

export const vehicles = [];

export function createDefaultVehiclesPerDistrict() {

    return Object.fromEntries(
        districts.map(district => [district.id, DEFAULT_VEHICLES_PER_DISTRICT])
    );

}

export function getDefaultPrisonDistrictIds() {
    return detentionComplexes.map(complex => complex.id);

}

export function setAvailablePrisons(prisonIds) {

    const validPrisonIds = new Set(detentionComplexes.map(complex => complex.id));
    const selected = [...new Set(prisonIds)].filter(id => validPrisonIds.has(id));

    if (!selected.length) {
        throw new Error("Selecteer minimaal één cellencomplex.");
    }

    sessionConfig.availablePrisons = selected;

}

export function resetSessionConfigDefaults() {

    sessionConfig.vehiclesPerDistrict = createDefaultVehiclesPerDistrict();
    sessionConfig.hotzoneDistrictIds = [];
    sessionConfig.hotzoneIncidentPercentage = DEFAULT_HOTZONE_INCIDENT_PERCENTAGE;
    sessionConfig.availablePrisons = getDefaultPrisonDistrictIds();
    sessionConfig.detentionCapacity = createDefaultDetentionCapacity();
    sessionConfig.operationMode = "automatic";
    sessionConfig.multiUnitIncidentPercentage = DEFAULT_MULTI_UNIT_INCIDENT_PERCENTAGE;
    sessionConfig.autoplayMinDelaySeconds = DEFAULT_AUTOPLAY_MIN_DELAY_SECONDS;
    sessionConfig.autoplayMaxDelaySeconds = DEFAULT_AUTOPLAY_MAX_DELAY_SECONDS;

    initializeVehicles();

}

export function setHotzoneDistrictIds(districtIds = []) {
    const validDistrictIds = new Set(districts.map(district => district.id));
    sessionConfig.hotzoneDistrictIds = [...new Set(districtIds)]
        .filter(id => validDistrictIds.has(id));
}

export function setDetentionCapacity(capacityByPrison) {
    sessionConfig.detentionCapacity = Object.fromEntries(detentionComplexes.map(complex => [
        complex.id,
        Math.max(0, Math.min(MAX_DETENTION_CAPACITY, Number.parseInt(capacityByPrison?.[complex.id], 10) || 0))
    ]));
}

export function getTotalDetentionCapacity() {
    return sessionConfig.availablePrisons.reduce((total, id) => total + (sessionConfig.detentionCapacity[id] || 0), 0);
}

export function getTotalDetentionOccupancy() {
    return sessionConfig.availablePrisons.reduce((total, id) => total + (simulator.detentionOccupancy[id] || 0), 0);
}

export function setVehiclesPerDistrict(vehiclesPerDistrict) {

    sessionConfig.vehiclesPerDistrict = Object.fromEntries(districts.map(district => {
        const requested = Number.parseInt(vehiclesPerDistrict?.[district.id], 10);
        const count = Number.isFinite(requested) ? requested : DEFAULT_VEHICLES_PER_DISTRICT;
        return [district.id, Math.max(0, Math.min(VEHICLE_CALLSIGNS[district.id].length, count))];
    }));

    initializeVehicles();

}

export function initializeVehicles() {

    vehicles.splice(0, vehicles.length);

    districts.forEach(district => {

        const callsigns = VEHICLE_CALLSIGNS[district.id];
        const vehicleCount = Math.max(0, Math.min(callsigns.length, Number(sessionConfig.vehiclesPerDistrict[district.id]) || 0));

        for (let i = 0; i < vehicleCount; i++) {

            const vehicle = {

                id: callsigns[i],

                callsign: callsigns[i],

                district: district.id,

                status: "AVAILABLE",

                x: district.x,

                y: district.y,

                targetX: district.x,

                targetY: district.y,

                speed: 90,

                incident: null,

                prison: null,

                angle: 0

            };
            Object.defineProperty(vehicle, "homeDistrict", {
                value: district.id,
                enumerable: true,
                writable: false,
                configurable: false
            });
            vehicles.push(vehicle);

        }

    });

}

initializeVehicles();


/*
==========================================================
Status
==========================================================
*/

export const simulator = {

    activeIncident: null,

    selectedPrison: null,

    travelTime: null,
    detentionOccupancy: createEmptyDetentionOccupancy(),

    incidentsHandled: 0,

    maxIncidents: null,

    gameOver: false,

    activeRoute: [],

    activeRoutes: [],

    incidentHistory: [],

    repositioningFailure: null

    ,incidents: []

    ,selectedVehicleId: null
    ,selectedVehicleIds: []

    ,vehicleSelection: { active: false, incidentId: null, selectedVehicleId: null, selectedVehicleIds: [], confirming: false }

    ,inputCycleState: { step: "INCIDENT", incidentId: null, prisonId: null, travelTime: null, selectedVehicleId: null, selectedVehicleIds: [] }

    ,manualRepositionState: { phase: "idle", selectedVehicleId: null, targetDistrictId: null }

    ,autoplayState: { running: false, nextIncidentAt: null, nextDelaySeconds: null }
    ,failureInspectionMode: false

};


/*
==========================================================
Kleuren
==========================================================
*/

export const colors = {

    RN: "#00AEEF",

    ZH: "#0072BC",

    RS: "#F7941D",

    RO: "#8CC63E",

    RZ: "#ED1C24",

    RZW: "#8E44AD",

    ZHZ: "#00BFA5"

};


/*
==========================================================
Handige functies
==========================================================
*/

export function getDistrict(id) {

    return districts.find(d => d.id === id);

}


export function getVehiclesInDistrict(id) {

    return vehicles.filter(vehicle =>
        vehicle.district === id &&
        vehicle.status === "available"
    );

}


export function getAvailableVehicles() {

    return vehicles.filter(vehicle =>
        vehicle.status === "available"
    );

}
