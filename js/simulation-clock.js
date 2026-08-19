export const SIMULATION_START_HOUR = 12;
export const SIMULATION_START_MINUTE = 0;
export const SIMULATION_START_SECOND = 0;
export const REAL_TIME_MULTIPLIER = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const START_TIME_MS = ((SIMULATION_START_HOUR * 60 + SIMULATION_START_MINUTE) * 60 + SIMULATION_START_SECOND) * 1000;

export function formatSimulationTime(realisticElapsedMs = 0) {
    const timeInDayMs = ((START_TIME_MS + realisticElapsedMs) % DAY_MS + DAY_MS) % DAY_MS;
    const totalSeconds = Math.floor(timeInDayMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
}

export class SimulationClock {
    constructor(now = performance.now()) { this.reset(now); }
    reset(now = performance.now()) { this.lastTimestamp = now; this.simulationElapsedMs = 0; }
    update(now = performance.now()) {
        this.simulationElapsedMs += Math.max(0, now - this.lastTimestamp);
        this.lastTimestamp = now;
    }
    get realisticElapsedMs() { return this.simulationElapsedMs * REAL_TIME_MULTIPLIER; }
    get displayTime() { return formatSimulationTime(this.realisticElapsedMs); }
}
