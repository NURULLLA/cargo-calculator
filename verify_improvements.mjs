import { Packer, CONFIG } from './packer.js';

const cargoItems = [{
    id: 1,
    name: 'Test Box',
    length: 120,
    width: 80,
    height: 160,
    weight: 900,
    count: 50,
    priority: false,
    noStack: false,
    allowTipping: true,
    mainDeckOnly: false,
    lowerDeckOnly: false
}];

console.log('=== USER CASE: 120x80x160, 900kg each ===\n');

// Manual check first - what should fit on a PAG pallet (301 cross x 207 long)?
// Box footprint options (picking smallest height = 80 as height is not allowed without tipping):
//   h=80:  floor = 120x160  → 301/160=1 col, 207/120=1 row = 1 main. Rem: 301-160=141 → 141/120=1 rotated col, 207/80=2 rows = 2 side → total 3
//          OR: 301/120=2 cols, 207/160=1 row = 2 main. Rem: 301-240=61. Not enough. Total=2
//          Hmm let me think differently. With h=80, box slabs are 120x160 or 160x120.
//   h=120: floor = 80x160  → 301/160=1, 207/80=2 = 2 main. rem=141. 141/80=1 col, 207/160=1 row = 1 side total=3
//          OR: 301/80=3 cols, 207/160=1 row = 3 main. Rem=301-240=61 not enough for 160. Total=3
//   h=160: floor = 80x120 → 301/120=2 cols, 207/80=2 rows = 4. rem=301-240=61<80. Rem long=207-160=47<80. No side. Total=4
//          OR: 301/80=3, 207/120=1 = 3. rem=301-240=61<120. rem long=207-120=87 >= 80!? 61/120=0. Hmm side: remlong=87>=80, availCross=301>=120. rows=floor(87/80)=1, cols=floor(301/120)=2 → 2 side! Total=3+2=5
//          So h=160 with B orientation (80 cross, 120 long) gives 3 main + 2 in horizontal gap = 5 boxes!

console.log('PAG CONFIG: 301 cross x 207 long x 208 max_height');
console.log('Box: 120x80x160 | EXPECTED with tipping=true: ~3 boxes per pallet (weight limited at 900kg each)\n');

const result = Packer.packAircraft('PAG', JSON.parse(JSON.stringify(cargoItems)), { aircraftId: 'UK75057' });

let totalBoxes = 0;
result.pallets.forEach(p => {
    if (p.currentWeight > 0) {
        const count = p.layers.reduce((acc, l) => acc + l.count, 0);
        totalBoxes += count;
        console.log(`Pallet ${p.id}: ${count} boxes | ${p.currentWeight}kg / ${p.maxNetWeight}kg limit | height used: ${p.currentHeight}cm`);
        p.layers.forEach((l, idx) => {
            let mainCount = (l.meta && l.meta.main) ? l.meta.main.c * l.meta.main.r : '?';
            let sideCount = (l.meta && l.meta.side) ? l.meta.side.count : 0;
            console.log(`  Layer ${idx+1}: ${l.count} boxes @ ${l.dim_cross}x${l.dim_long}x${l.height}cm | Main:${mainCount} + Side:${sideCount}`);
        });
    }
});

const leftovers = result.leftovers.reduce((a, i) => a + i.count, 0);
console.log(`\nTotal packed: ${totalBoxes} | Leftovers: ${leftovers}`);

// Also test PMC
console.log('\n--- PMC CONFIG: 301 cross x 227 long ---');
const result2 = Packer.packAircraft('PMC', JSON.parse(JSON.stringify(cargoItems)), { aircraftId: 'UK75057' });
let totalPMC = 0;
result2.pallets.forEach(p => {
    if (p.currentWeight > 0) {
        const count = p.layers.reduce((acc, l) => acc + l.count, 0);
        totalPMC += count;
        console.log(`Pallet ${p.id}: ${count} boxes | ${p.currentWeight}kg / ${p.maxNetWeight}kg limit`);
        p.layers.forEach((l, idx) => {
            let mainCount = (l.meta && l.meta.main) ? l.meta.main.c * l.meta.main.r : '?';
            let sideCount = (l.meta && l.meta.side) ? l.meta.side.count : 0;
            console.log(`  Layer ${idx+1}: ${l.count} boxes @ ${l.dim_cross}x${l.dim_long}x${l.height}cm | Main:${mainCount} + Side:${sideCount}`);
        });
    }
});
console.log(`\nPMC Total: ${totalPMC} | Leftovers: ${result2.leftovers.reduce((a,i)=>a+i.count,0)}`);

// Also verify no-tipping for comparison
console.log('\n--- NO TIPPING (original height=160 locked) ---');
const noTipItems = JSON.parse(JSON.stringify(cargoItems));
noTipItems[0].allowTipping = false;
const result3 = Packer.packAircraft('PAG', noTipItems, { aircraftId: 'UK75057' });
let totalNoTip = 0;
result3.pallets.forEach(p => {
    if (p.currentWeight > 0) {
        const count = p.layers.reduce((acc, l) => acc + l.count, 0);
        totalNoTip += count;
        console.log(`Pallet ${p.id}: ${count} boxes | ${p.currentWeight}kg / ${p.maxNetWeight}kg`);
    }
});
console.log(`No-tip Total: ${totalNoTip}`);
