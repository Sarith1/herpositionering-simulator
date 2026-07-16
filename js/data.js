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

        prison: true,

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

        prison: false,

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

export const vehicles = [];

districts.forEach(district => {

    for (let i = 1; i <= 3; i++) {

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

            prison: null

        });

    }

});


/*
==========================================================
Status
==========================================================
*/

export const simulator = {

    activeIncident: null,

    selectedPrison: null,

    travelTime: null,

    score: 0,

    incidentsHandled: 0,

    maxIncidents: null,

    gameOver: false,

    activeRoute: [],

    activeRoutes: [],

    incidentHistory: [],

    lastScoreBreakdown: null

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
