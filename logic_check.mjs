
import { Packer } from './packer.js';

console.log("Running Logic Check...");

const items = [
    { id: 1, name: 'Test Box', length: 120, width: 100, height: 100, weight: 500, count: 5, allowTipping: false }
];

try {
    const result = Packer.packAircraft("PAG", items);
    console.log("Pallets:", result.pallets.length);
    console.log("First Pallet Weight:", result.pallets[0]?.currentWeight);

    if (result.pallets[0]?.currentWeight > 0) {
        console.log("SUCCESS: Packing logic is working.");
    } else {
        console.log("FAILURE: Packing logic returned empty result.");
    }
} catch (e) {
    console.error("CRASH:", e);
}
