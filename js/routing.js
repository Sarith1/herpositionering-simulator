/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.5
Bestand: routing.js

Kortste-route helpers voor districten, voertuigen en reistijd.
==========================================================
*/

import { districts } from "./data.js";

export function getDistrictById(districtId) {
    return districts.find(district => district.id === districtId) || null;
}

export function getPrisonDistricts() {
    return districts.filter(district => district.prison);
}

export function getShortestRoute(startDistrictId, endDistrictId) {
    if (startDistrictId === endDistrictId) return [startDistrictId];

    const queue = [[startDistrictId]];
    const visited = new Set([startDistrictId]);

    while (queue.length > 0) {
        const route = queue.shift();
        const currentDistrict = getDistrictById(route[route.length - 1]);

        if (!currentDistrict) continue;

        for (const neighbourId of currentDistrict.neighbours) {
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

export function calculateTravelTime(route) {
    const distance = getRouteDistance(route);
    const baseTime = 90;
    const maximumExtraTime = 30;
    const districtPenalty = Math.min(maximumExtraTime, distance * 10);
    const variation = Math.floor(Math.random() * 11);

    return Math.min(120, baseTime + districtPenalty + variation);
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
