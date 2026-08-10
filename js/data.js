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

// Cellencomplexen zijn zelfstandige routenetwerknodes. De centrale locatie ligt
// bewust iets ten westen van het kaartmidden om labels en voertuigclusters vrij te houden.
export const detentionComplexes = [
    { id: "CELL_RS", name: "Cellencomplex Rotterdam-Stad", x: 590, y: 223, neighbours: ["RS", "RN"] },
    { id: "CELL_ZHZ", name: "Cellencomplex Zuid-Holland-Zuid", x: 670, y: 438, neighbours: ["ZHZ", "RZ"] },
    { id: "CELL_CENTRAL", name: "Centraal Cellencomplex", x: 410, y: 315, neighbours: ["RS", "RZ", "ZH"] }
];

export const sessionConfig = {

    vehiclesPerDistrict: createDefaultVehiclesPerDistrict(),

    availablePrisons: getDefaultPrisonDistrictIds(),
    operationMode: "automatic"

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
    sessionConfig.availablePrisons = getDefaultPrisonDistrictIds();
    sessionConfig.operationMode = "automatic";

    initializeVehicles();

}

export function setVehiclesPerDistrict(vehiclesPerDistrict) {

    sessionConfig.vehiclesPerDistrict = {
        ...createDefaultVehiclesPerDistrict(),
        ...vehiclesPerDistrict
    };

    initializeVehicles();

}

export function initializeVehicles() {

    vehicles.splice(0, vehicles.length);

    districts.forEach(district => {

        const vehicleCount = Math.max(0, Number(sessionConfig.vehiclesPerDistrict[district.id]) || 0);

        for (let i = 1; i <= vehicleCount; i++) {

            vehicles.push({

                id: `${district.id}-${String(i).padStart(2, "0")}`,

                district: district.id,

                homeDistrict: district.id,

                status: "AVAILABLE",

                x: district.x,

                y: district.y,

                targetX: district.x,

                targetY: district.y,

                speed: 90,

                incident: null,

                prison: null,

                angle: 0

            });

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

    incidentsHandled: 0,

    maxIncidents: null,

    gameOver: false,

    activeRoute: [],

    activeRoutes: [],

    incidentHistory: [],

    repositioningFailure: null

    ,incidents: []

    ,selectedVehicleId: null

    ,vehicleSelection: { active: false, incidentId: null, selectedVehicleId: null, confirming: false }

    ,inputCycleState: { step: "INCIDENT", incidentId: null, prisonId: null, travelTime: null, selectedVehicleId: null }

    ,manualRepositionState: { phase: "idle", selectedVehicleId: null, targetDistrictId: null }

    ,autoplayState: { running: false, nextIncidentAt: null, nextDelaySeconds: null }

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
