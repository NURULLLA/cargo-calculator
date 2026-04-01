
import { Packer, CONFIG } from './packer.js';

console.log("=== SKY_GUARD LOGIC TEST ===");

const item = {
    id: 1,
    name: 'Test Cargo 142x111x153',
    length: 142,
    width: 111,
    height: 153,
    weight: 100,
    count: 4,
    priority: false,
    mainDeckOnly: false,
    noStack: false,
    allowTipping: false
};

const result = Packer.packAircraft('PMC', [item]);

const pallet2 = result.pallets[1]; // MIDDLE zone
console.log(`Pallet 2 (MIDDLE) Count: ${pallet2.layers.reduce((s, l) => s + l.count, 0)}`);

const pallet13 = result.pallets[12]; // TAIL zone
console.log(`Pallet 13 (TAIL) Count: ${pallet13.layers.reduce((s, l) => s + l.count, 0)}`);

if (pallet2.layers.length > 0 && pallet2.layers[0].count === 4) {
    console.log("✅ SUCCESS: Middle zone fits 4 boxes.");
} else {
    console.log("❌ FAILURE: Middle zone fits " + (pallet2.layers[0] ? pallet2.layers[0].count : 0));
}
