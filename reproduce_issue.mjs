import { Packer, CONFIG } from './packer.js';

const cargoItems = [
    {
        id: 1,
        name: "User Cargo",
        length: 108,
        width: 27,
        height: 95,
        weight: 18,
        count: 400,
        priority: false,
        noStack: false,
        allowTipping: true, // User said 108x27x95, usually they expect some rotation
        mainDeckOnly: false
    }
];

console.log("Testing with allowTipping: true");
const resultPAG = Packer.packAircraft("PAG", JSON.parse(JSON.stringify(cargoItems)), { aircraftId: "UK75057", mainDeckOnly: false });

console.log("\n--- PAG RESULTS ---");
let totalPAG = 0;
resultPAG.pallets.forEach(p => {
    if (p.currentWeight > 0) {
        console.log(`Pallet ${p.id}: Weight ${p.currentWeight}kg, Height ${p.currentHeight}cm, Layers: ${p.layers.length}`);
        totalPAG += p.layers.reduce((acc, l) => acc + l.count, 0);
    }
});
console.log(`Total packed in pallets: ${totalPAG}`);

let totalLower = 0;
resultPAG.lowerDeck.forEach(hold => {
    hold.compartments.forEach(comp => {
        const count = comp.items.reduce((acc, i) => acc + i.count, 0);
        if (count > 0) {
            console.log(`Lower Deck ${comp.name}: ${count} boxes, Weight ${comp.weight}kg`);
            totalLower += count;
        }
    });
});

const leftoverCount = resultPAG.leftovers.reduce((acc, i) => acc + i.count, 0);
console.log(`Leftovers: ${leftoverCount}`);

console.log("\nTesting with allowTipping: false");
cargoItems[0].allowTipping = false;
const resultPAG_noTip = Packer.packAircraft("PAG", JSON.parse(JSON.stringify(cargoItems)), { aircraftId: "UK75057", mainDeckOnly: false });
const totalPAG_noTip = resultPAG_noTip.pallets.reduce((acc, p) => acc + p.layers.reduce((lAcc, l) => lAcc + l.count, 0), 0);
const leftoverCount_noTip = resultPAG_noTip.leftovers.reduce((acc, i) => acc + i.count, 0);
console.log(`Total packed (no tip): ${totalPAG_noTip}, Leftovers: ${leftoverCount_noTip}`);
