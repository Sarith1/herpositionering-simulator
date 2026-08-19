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
    constructor() { this.reset(); }
    reset() {
        this.started = false;
        this.running = false;
        this.elapsedRealMs = 0;
        this.lastStartedAt = null;
    }
    start(now = performance.now()) {
        if (!this.started) this.started = true;
        if (this.running) return;
        this.running = true;
        this.lastStartedAt = now;
    }
    pause(now = performance.now()) {
        if (!this.running) return;
        this.elapsedRealMs += Math.max(0, now - this.lastStartedAt);
        this.running = false;
        this.lastStartedAt = null;
    }
    update(now = performance.now()) {
        if (!this.running) return;
        this.elapsedRealMs += Math.max(0, now - this.lastStartedAt);
        this.lastStartedAt = now;
    }
    get realisticElapsedMs() { return this.elapsedRealMs * REAL_TIME_MULTIPLIER; }
    get displayTime() { return formatSimulationTime(this.realisticElapsedMs); }
}
