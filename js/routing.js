/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.3

routing.js

Verantwoordelijk voor:

- Kortste route
- Afstand tussen districten
- Reistijd
==========================================================
*/

import { districts, getDistrict } from "./data.js";

export class Routing {

    constructor() {

        this.graph = new Map();

        this.buildGraph();

    }

    /*
    ======================================================
    Graaf opbouwen
    ======================================================
    */

    buildGraph() {

        districts.forEach(district => {

            this.graph.set(
                district.id,
                district.neighbours
            );

        });

    }

    /*
    ======================================================
    Kortste route (Breadth First Search)
    ======================================================
    */

    shortestPath(start, end) {

        if (start === end) {
            return [start];
        }

        const queue = [[start]];
        const visited = new Set();

        while (queue.length > 0) {

            const path = queue.shift();

            const node = path[path.length - 1];

            if (visited.has(node)) {
                continue;
            }

            visited.add(node);

            const neighbours =
                this.graph.get(node) || [];

            for (const neighbour of neighbours) {

                const newPath = [...path, neighbour];

                if (neighbour === end) {
                    return newPath;
                }

                queue.push(newPath);

            }

        }

        return [];

    }

    /*
    ======================================================
    Aantal wegsegmenten
    ======================================================
    */

    distance(start, end) {

        const route =
            this.shortestPath(start, end);

        if (route.length === 0)
            return Infinity;

        return route.length - 1;

    }

    /*
    ======================================================
    Reistijd

    90 t/m 120 seconden

    Iedere wegverbinding
    verhoogt de reistijd.
    ======================================================
    */

    calculateTravelTime(start, prison) {

        const segments =
            this.distance(start, prison);

        if (segments === Infinity)
            return 120;

        let seconds =
            90 + (segments * 8);

        seconds +=
            Math.floor(Math.random() * 7);

        seconds =
            Math.max(90, seconds);

        seconds =
            Math.min(120, seconds);

        return seconds;

    }

    /*
    ======================================================
    Dichtstbijzijnde gevangenis
    ======================================================
    */

    nearestPrison(fromDistrict) {

        const prisons =
            districts.filter(d => d.prison);

        let winner = null;

        let distance = Infinity;

        prisons.forEach(prison => {

            const d =
                this.distance(
                    fromDistrict,
                    prison.id
                );

            if (d < distance) {

                distance = d;

                winner = prison;

            }

        });

        return winner;

    }

    /*
    ======================================================
    Totale route

    melding

        ↓

    gevangenis
    ======================================================
    */

    completeRoute(incidentDistrict, prisonDistrict) {

        return this.shortestPath(
            incidentDistrict,
            prisonDistrict
        );

    }

    /*
    ======================================================
    Routecoördinaten

    Nodig voor animaties
    ======================================================
    */

    routeCoordinates(route) {

        return route.map(id => {

            const district =
                getDistrict(id);

            return {

                x: district.x,
                y: district.y,
                id: district.id,
                name: district.name

            };

        });

    }

}
