import { Packer, CONFIG } from './packer.js';

const cargoItems = [
    {
        id: 1,
        name: "Test Cargo",
        length: 120,
        width: 80,
        height: 160,
        weight: 500, // Guessing weight
        count: 100,
        priority: false,
        noStack: false,
        allowTipping: true,
        mainDeckOnly: true
    }
];

console.log("--- TESTING USER CASE : 120x80x160 ---");

function testWithWeight(w) {
    console.log(`\nTesting with weight: ${w}kg`);
    cargoItems[0].weight = w;
    const result = Packer.packAircraft("PAG", JSON.parse(JSON.stringify(cargoItems)), { aircraftId: "UK75057", mainDeckOnly: true });

    result.pallets.forEach(p => {
        if (p.currentWeight > 0) {
            const count = p.layers.reduce((acc, l) => acc + l.count, 0);
            console.log(`Pallet ${p.id}: ${count} boxes, Weight ${p.currentWeight}kg, Height ${p.currentHeight}cm, Layers: ${p.layers.length}`);
            p.layers.forEach((l, idx) => {
                console.log(`  Layer ${idx+1}: ${l.count} boxes (${l.dim_cross}x${l.dim_long}x${l.height})`);
            });
        }
    });

    const leftoverCount = result.leftovers.reduce((acc, i) => acc + i.count, 0);
    console.log(`Leftovers: ${leftoverCount}`);
}

testWithWeight(100);
testWithWeight(800);
testWithWeight(1200);
