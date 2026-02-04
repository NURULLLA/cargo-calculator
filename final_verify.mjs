
import { Packer, CONFIG } from './packer.js';

const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Generate 35,000kg load
function generateFullLoad() {
    let items = [];
    // Regular
    for (let i = 0; i < 20; i++) {
        items.push({
            id: `reg_${i}`, name: `Regular Box ${i}`,
            length: rnd(40, 120), width: rnd(30, 80), height: rnd(30, 80),
            weight: rnd(20, 100), count: rnd(20, 50),
            allowTipping: true, noStack: false
        });
    }
    // No-Stack (Fragile)
    for (let i = 0; i < 10; i++) {
        items.push({
            id: `ns_${i}`, name: `Fragile Box ${i}`,
            length: rnd(50, 100), width: rnd(40, 80), height: rnd(40, 80),
            weight: rnd(15, 60), count: rnd(5, 15),
            allowTipping: true, noStack: true
        });
    }
    return items;
}

console.log("STARTING FINAL VERIFICATION");
const items = generateFullLoad();
const result = Packer.packAircraft("PAG", items);

// Stats
let totalNet = 0;
let totalVol = 0;
let boxCount = 0;

result.pallets.forEach(p => {
    if (p.currentWeight > 0) {
        totalNet += p.currentWeight;
        p.layers.forEach(l => {
            boxCount += l.count;
            if (l.dim_cross && l.dim_long) {
                totalVol += (l.dim_cross * l.dim_long * l.height * l.count) / 1000000;
            }
        });
    }
});

result.lowerDeck.forEach(h => {
    totalNet += h.current_weight;
    h.compartments.forEach(c => {
        if (c.volume) totalVol += c.volume;
        c.items.forEach(i => boxCount += i.count);
    });
});

console.log(`Net Weight: ${totalNet.toLocaleString()} kg`);
console.log(`Volume: ${totalVol.toFixed(2)} m3`);
console.log(`Boxes: ${boxCount}`);

if (totalVol > 0 && boxCount > 0) console.log("SUCCESS: Volume and Boxes Present.");
else console.log("FAILURE: Volume or Boxes missing.");

// Check Lower Deck Viz Props
let ldVizFail = 0;
result.lowerDeck.forEach(h => {
    h.compartments.forEach(c => {
        c.items.forEach(i => {
            if (!i.l || !i.w || !i.h) ldVizFail++;
        });
    });
});
if (ldVizFail === 0) console.log("SUCCESS: Lower Deck Data valid.");
else console.log(`FAILURE: Lower Deck Data invalid (${ldVizFail})`);
