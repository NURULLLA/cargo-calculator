
// Extracting the mapping logic from app.js to test it
function getColIdx(headers, aliases) {
    // Priority 1: Exact match
    let idx = headers.findIndex(h => aliases.some(a => h === a.toLowerCase()));
    if (idx !== -1) return idx;
    
    // Priority 2: Starts with
    idx = headers.findIndex(h => aliases.some(a => h.startsWith(a.toLowerCase())));
    if (idx !== -1) return idx;

    // Priority 3: Includes (only for longer aliases)
    return headers.findIndex(h => aliases.some(a => a.length > 2 && h.includes(a.toLowerCase())));
}

function testMapping(rows) {
    if (!rows || rows.length < 2) return "No data";

    const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
    const dataRows = rows.slice(1, 4); // Test first 3 data rows

    const colMapping = {
        name: getColIdx(headers, ['box', 'item name', 'name', 'description', 'batch', 'cargo', 'box #']),
        width: getColIdx(headers, ['w cm', 'width', 'w (cm)', 'breadth', 'w']),
        length: getColIdx(headers, ['d cm', 'l cm', 'length', 'l (cm)', 'depth', 'd', 'l']),
        height: getColIdx(headers, ['h cm', 'height', 'h (cm)', 'h']),
        weight: getColIdx(headers, ['kg', 'weight', 'wt', 'kgs', 'weight kg']),
        qty: getColIdx(headers, ['qty', 'quantity', 'count', 'units', 'pcs'])
    };

    headers.forEach((h, i) => {
        console.log(`Index ${i}: "${h}"`);
        ['box', 'w cm', 'd cm', 'h cm', 'kg'].forEach(a => {
            if (h.includes(a)) console.log(`  - Match! "${h}" includes "${a}"`);
        });
    });

    console.log("Headers:", headers);
    console.log("Mapping:", colMapping);

    const results = [];
    dataRows.forEach((row, idx) => {
        if (!row || row.length === 0) return;
        
        results.push({
            name: colMapping.name !== -1 ? String(row[colMapping.name] || `Item ${idx + 1}`) : `Item ${idx + 1}`,
            l: colMapping.length !== -1 ? parseFloat(row[colMapping.length]) : NaN,
            w: colMapping.width !== -1 ? parseFloat(row[colMapping.width]) : NaN,
            h: colMapping.height !== -1 ? parseFloat(row[colMapping.height]) : NaN,
            wt: colMapping.weight !== -1 ? parseFloat(row[colMapping.weight]) : NaN,
            qty: colMapping.qty !== -1 ? parseInt(row[colMapping.qty]) || 1 : 1
        });
    });
    return results;
}

// Data from Packing List (CBL-LHE).xlsx analysis
const sampleRows = [
    ["#", "Box", "W CM", "D CM", "H CM", "kg", "Cube 3", null],
    [1, 1001, 170, 109, 67, 236, 1.24151, null],
    [2, 1002, 170, 109, 67, 225, 1.24151, null],
    [3, 1003, 90, 66, 55, 70, 0.3267, null]
];

console.log("Test 1: Standard Excel structure");
console.log(JSON.stringify(testMapping(sampleRows), null, 2));

// Test 2: Different names
const deviantRows = [
    ["Item Name", "Width", "Length", "Height", "Weight", "Quantity"],
    ["Test 1", 100, 200, 300, 50, 5],
    ["Test 2", 150, 250, 350, 75, 10]
];

console.log("\nTest 2: Deviant Excel structure");
console.log(JSON.stringify(testMapping(deviantRows), null, 2));
