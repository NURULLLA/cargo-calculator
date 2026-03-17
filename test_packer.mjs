import { Packer, CONFIG } from './packer.js';
import process from 'process';

// Mock Items from the user's description. Or let's just use the analyze_excel tool if we have it?
// We need the items from Packing List (CBL-LHE).xlsx.
// Let's write a quick script to read the excel file, pass to Packer, and print the results just like the app does.

import XLSX from 'xlsx';
import fs from 'fs';

function getColIdx(headers, aliases) {
    let idx = headers.findIndex(h => aliases.some(a => h === a.toLowerCase()));
    if (idx !== -1) return idx;
    idx = headers.findIndex(h => aliases.some(a => h.startsWith(a.toLowerCase())));
    if (idx !== -1) return idx;
    return headers.findIndex(h => aliases.some(a => a.length > 2 && h.includes(a.toLowerCase())));
}

const fileBuf = fs.readFileSync('Packing List (CBL-LHE).xlsx');
const workbook = XLSX.read(fileBuf, { type: 'buffer' });
const firstSheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[firstSheetName];
const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

if (rows.length < 2) {
    console.error("Not enough data");
    process.exit(1);
}

const rawHeaders = rows[0] || [];
const headers = rawHeaders.map(h => String(h || '').trim().toLowerCase());

const colMapping = {
    name: getColIdx(headers, ['box', 'item name', 'name', 'description', 'batch', 'cargo', 'box #']),
    width: getColIdx(headers, ['w cm', 'width', 'w (cm)', 'breadth', 'w']),
    length: getColIdx(headers, ['d cm', 'l cm', 'length', 'l (cm)', 'depth', 'd', 'l']),
    height: getColIdx(headers, ['h cm', 'height', 'h (cm)', 'h']),
    weight: getColIdx(headers, ['kg', 'weight', 'wt', 'kgs', 'weight kg']),
    qty: getColIdx(headers, ['qty', 'quantity', 'count', 'units', 'pcs'])
};

let cargoItems = [];
let idCounter = 1;

for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const w = parseFloat(row[colMapping.width]);
    const l = parseFloat(row[colMapping.length]);
    const h = parseFloat(row[colMapping.height]);
    const wt = parseFloat(row[colMapping.weight]);
    
    if (isNaN(w) || isNaN(l) || isNaN(h) || isNaN(wt)) continue;

    let qty = 1;
    if (colMapping.qty !== -1 && !isNaN(parseFloat(row[colMapping.qty]))) {
        qty = parseFloat(row[colMapping.qty]);
    }

    let name = `Item ${idCounter}`;
    if (colMapping.name !== -1 && row[colMapping.name]) {
        name = String(row[colMapping.name]);
    }

    cargoItems.push({
        id: idCounter++,
        name: name,
        length: l,
        width: w,
        height: h,
        weight: wt,
        count: qty,
        priority: false,
        noStack: false,
        allowTipping: false,
        mainDeckOnly: false
    });
}

console.log(`Loaded ${cargoItems.reduce((acc, c) => acc + c.count, 0)} items total count.`);

const result = Packer.packAircraft("PAG", cargoItems, { aircraftId: "UK57057", mainDeckOnly: false });

console.log("\n--- MAIN DECK ---");
let totalMainWeight = 0;
result.pallets.forEach((p, i) => {
    let layersStr = p.layers.map(l => `${l.count}x[${l.box_name}]`).join(', ');
    console.log(`Pallet ${i+1}: Weight=${p.currentWeight}kg, Height=${p.currentHeight}cm. Layers: ${layersStr}`);
    totalMainWeight += p.currentWeight;
});
console.log(`Main Deck Total Weight: ${totalMainWeight}kg`);

console.log("\n--- LOWER DECK ---");
let totalLowerWeight = 0;
result.lowerDeck.forEach(hold => {
    console.log(`Hold: ${hold.name} (${hold.current_weight}kg)`);
    hold.compartments.forEach(comp => {
        let itemsStr = comp.items.map(i => `${i.count}x[${i.name}]`).join(', ');
        console.log(`  Comp ${comp.name}: Weight=${comp.weight}kg, Vol=${comp.volume.toFixed(2)}m3. Items: ${itemsStr}`);
        totalLowerWeight += comp.weight;
    });
});
console.log(`Lower Deck Total Weight: ${totalLowerWeight}kg`);

console.log("\n--- LEFTOVERS ---");
console.log(result.leftovers.map(l => `${l.count}x[${l.name}]`).join('\n'));

