
import { Packer, CONFIG } from './packer.js';

console.log("=== SKY_GUARD DEBUGGING CALCULATIONS ===");

// We'll emulate what happens inside Packer.calculateLayer
const variant = { l: 142, w: 111, h: 153, weight: 100, name: 'Test' };
const palletConfig = CONFIG.PALLET_OPTIONS.PMC;

// Fuselage width calculation (MIDDLE zone logic)
function getDebugFuselageWidth(h) {
    const FUSELAGE_PROFILES = {
        MIDDLE: [
            [0, 317], [140, 301], [165, 275], [170, 260], [175, 255],
            [180, 245], [185, 235], [190, 225], [195, 215], [200, 200],
            [205, 185]
        ]
    };
    const profile = FUSELAGE_PROFILES.MIDDLE;
    const sorted = [...profile].sort((a, b) => a[0] - b[0]);
    let w = 0;
    if (h <= sorted[0][0]) w = sorted[0][1];
    else if (h >= sorted[sorted.length - 1][0]) w = sorted[sorted.length - 1][1];
    else {
        for (let i = 0; i < sorted.length - 1; i++) {
            const [h0, w0] = sorted[i];
            const [h1, w1] = sorted[i + 1];
            if (h >= h0 && h <= h1) {
                const t = (h - h0) / (h1 - h0);
                w = w0 + t * (w1 - w0);
                break;
            }
        }
    }
    return Math.min(303, w); // 303 = PMC length_cross
}

const checkH = 153;
const fuselageW = getDebugFuselageWidth(checkH);
const availCross = Math.min(303, fuselageW);
const availLong = 229; // PMC width_long

console.log(`Height: ${checkH} cm`);
console.log(`Fuselage Width: ${fuselageW.toFixed(2)} cm`);
console.log(`Available Cross (max 303): ${availCross.toFixed(2)} cm`);
console.log(`Available Long: ${availLong} cm`);

// Simulation of tryOrientation(142, 111)
let colsA = Math.floor(availCross / 142);
let rowsA = Math.floor(availLong / 111);
console.log(`Orientation A (Across=142, Long=111): Cols=${colsA}, Rows=${rowsA}, Total=${colsA*rowsA}`);

// Simulation of tryOrientation(111, 142)
let colsB = Math.floor(availCross / 111);
let rowsB = Math.floor(availLong / 142);
console.log(`Orientation B (Across=111, Long=142): Cols=${colsB}, Rows=${rowsB}, Total=${colsB*rowsB}`);

// Now check if Packer object works with these values
const mockPallet = {
    currentHeight: 0,
    currentWeight: 0,
    config: palletConfig,
    zone: 'MIDDLE',
    getFuselageWidth: (h) => getDebugFuselageWidth(h)
};

const layerRes = Packer.calculateLayer(mockPallet, variant);
console.log(`Actual Packer.calculateLayer Result: ${JSON.stringify(layerRes)}`);
