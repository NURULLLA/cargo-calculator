
// JSDOM Simulation for Packer Test
import { Packer, CONFIG } from './packer.js?v=3';

console.log("Starting JSDOM Simulation Test...");

// Mock Browser Globals if needed (packer.js might be pure JS, but good to have)
global.CONFIG = CONFIG;

const items = [
    { id: 1, name: 'Browser Test Box', length: 120, width: 100, height: 100, weight: 500, count: 10, allowTipping: false }
];

try {
    console.log("Calling Packer.packAircraft...");
    const result = Packer.packAircraft("PAG", items);

    console.log("Result Pallets: " + result.pallets.length);
    if (result.pallets.length > 0 && result.pallets[0].currentWeight > 0) {
        console.log("SUCCESS: Packer logic returned valid results.");
        console.log("Load: " + result.pallets[0].currentWeight + "kg");
    } else {
        console.log("FAILURE: Result empty or invalid.");
    }

} catch (e) {
    console.error("CRITICAL ERROR:", e);
}
