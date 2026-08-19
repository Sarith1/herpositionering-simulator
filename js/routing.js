/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.5
Bestand: routing.js

Kortste-route helpers voor districten, voertuigen en reistijd.
==========================================================
*/

import { detentionComplexes, districts, sessionConfig } from "./data.js";

const getNodes = () => [...districts, ...detentionComplexes];

export function getDistrictById(districtId) {
    return getNodes().find(node => node.id === districtId) || null;
}

// The route graph is the single source of truth for district adjacency.  Some
// older data is one-directional, so expose it as the undirected graph used by
// shortest-route calculations as well.
export function getAdjacentDistrictIds(districtId) {
    const district = getDistrictById(districtId);
    if (!district) return [];
    const reverseNeighbours = getNodes()
        .filter(node => node.neighbours?.includes(districtId))
        .map(node => node.id);
    return [...new Set([...(district.neighbours || []), ...reverseNeighbours])];
}

export function getPrisonDistricts() {
    return detentionComplexes.filter(complex => sessionConfig.availablePrisons.includes(complex.id));
}

export function getShortestRoute(startDistrictId, endDistrictId) {
    if (startDistrictId === endDistrictId) return [startDistrictId];

    const queue = [[startDistrictId]];
    const visited = new Set([startDistrictId]);

    while (queue.length > 0) {
        const route = queue.shift();
        const currentDistrict = getDistrictById(route[route.length - 1]);

        if (!currentDistrict) continue;

        for (const neighbourId of getAdjacentDistrictIds(currentDistrict.id)) {
            if (visited.has(neighbourId)) continue;

            const nextRoute = [...route, neighbourId];

            if (neighbourId === endDistrictId) {
                return nextRoute;
            }

            visited.add(neighbourId);
            queue.push(nextRoute);
        }
    }

    return [];
}

export function getRouteDistance(route) {
    if (!route || route.length < 2) return 0;

    return route.length - 1;
}

export function calculateTravelTime(route, random = Math.random) {
    const min = sessionConfig.travelTimeMinSeconds;
    const max = sessionConfig.travelTimeMaxSeconds;
    return calculateTravelTimeForRange(route, min, max, random);
}

export function calculateTravelTimeForRange(route, min, max, random = Math.random) {
    const distance = getRouteDistance(route);
    const span = max - min;
    // Four route edges represent the long end of this compact network. A
    // small bounded variation prevents identical routes always taking exactly
    // the same time while preserving distance as the dominant influence.
    const distancePosition = Math.min(1, distance / 4);
    const variation = (random() - 0.5) * span * 0.2;
    return Math.round(Math.max(min, Math.min(max, min + span * distancePosition + variation)));
}

export function findNearestAvailableVehicle(vehicles, targetDistrictId) {
    const availableVehicles = vehicles.filter(vehicle => vehicle.status === "AVAILABLE");

    let nearestVehicle = null;
    let nearestRoute = [];

    availableVehicles.forEach(vehicle => {
        const route = getShortestRoute(vehicle.district, targetDistrictId);

        if (!route.length) return;

        if (
            !nearestVehicle ||
            getRouteDistance(route) < getRouteDistance(nearestRoute) ||
            (getRouteDistance(route) === getRouteDistance(nearestRoute) && vehicle.id.localeCompare(nearestVehicle.id) < 0)
        ) {
            nearestVehicle = vehicle;
            nearestRoute = route;
        }
    });

    return {
        vehicle: nearestVehicle,
        route: nearestRoute
    };
}
