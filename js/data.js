/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.2
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

        x: 455,
        y: 105,

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

        x: 235,
        y: 250,

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

        x: 505,
        y: 245,

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

        x: 760,
        y: 250,

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

        x: 270,
        y: 470,

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

        x: 560,
        y: 430,

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

        x: 600,
        y: 650,

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

            status: "available",

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

    gameOver: false

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
