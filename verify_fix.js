
function parseHeaders(headersRow) {
    // This is the fix we applied: Array.from(headersRow || []).map(...)
    return Array.from(headersRow || []).map(h => String(h || '').trim().toLowerCase());
}

function findCol(headers, aliases) {
    // This is the fallback logic used in app.js
    let idx = headers.findIndex(h => aliases.some(a => h === a.toLowerCase()));
    if (idx !== -1) return idx;
    
    idx = headers.findIndex(h => h && aliases.some(a => h.startsWith(a.toLowerCase())));
    if (idx !== -1) return idx;

    return headers.findIndex(h => h && aliases.some(a => a.length > 2 && h.includes(a.toLowerCase())));
}

// Test Case 1: Sparse array (holes) from SheetJS
const sparseHeaders = ["Description", , "Weight"];
console.log("Sparse Headers Input:", sparseHeaders);
const processedHeaders = parseHeaders(sparseHeaders);
console.log("Processed Headers:", processedHeaders);

const aliases = ['weight', 'kg', 'wt'];
try {
    const idx = findCol(processedHeaders, aliases);
    console.log("Found Column Index:", idx);
    if (idx === 2) {
        console.log("✅ TEST PASSED: No crash on sparse headers");
    } else {
        console.log("❌ TEST FAILED: Wrong index found");
    }
} catch (e) {
    console.log("❌ TEST FAILED: Crashed with error:", e.message);
}

// Test Case 2: Combined size parsing logic
function parseSize(sizeStr) {
    const nums = sizeStr.match(/\d+(\.\d+)?/g);
    if (nums && nums.length >= 3) {
        return {
            l: parseFloat(nums[0]),
            w: parseFloat(nums[1]),
            h: parseFloat(nums[2])
        };
    }
    return null;
}

const size1 = "65 x 45.5 x 30";
const parsed1 = parseSize(size1);
console.log(`Size parsing "${size1}":`, parsed1);
if (parsed1 && parsed1.l === 65 && parsed1.w === 45.5 && parsed1.h === 30) {
    console.log("✅ TEST PASSED: Size parsing works for 'x' delimiter");
}

const size2 = "50*50*55";
const parsed2 = parseSize(size2);
console.log(`Size parsing "${size2}":`, parsed2);
if (parsed2 && parsed2.l === 50 && parsed2.w === 50 && parsed2.h === 55) {
    console.log("✅ TEST PASSED: Size parsing works for '*' delimiter");
}
