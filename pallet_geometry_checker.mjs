/**
 * PALLET GEOMETRY CHECKER — Independent Brute-Force Verifier
 * 
 * Finds the ABSOLUTE MAXIMUM number of identical boxes that can fit on a pallet,
 * independently of the main packer.js logic. Uses exhaustive guillotine-cut search.
 * 
 * Usage: node pallet_geometry_checker.mjs
 */

// ══════════════════════════════════════════════════════════════
// CONFIGURATION — Edit these values to check any scenario
// ══════════════════════════════════════════════════════════════

const BOX = {
    l: 120,  // cm
    w: 80,   // cm
    h: 160,  // cm
    weight: 900,    // kg
    allowTipping: true  // if true, all 3 axes can be "up"
};

const PALLETS = {
    PAG: {
        cross: 301,   // cm (left-right, fuselage width direction)
        long:  207,   // cm (front-back, pallet depth direction)
        maxH:  208,   // cm (max stack height)
        netLimits: {  // net weight limits by position number
            1:  2606,
            8:  4154,
            9:  4154,
            default: 2838
        }
    },
    PMC: {
        cross: 301,
        long:  227,
        maxH:  208,
        netLimits: {
            1:  2736,
            6:  4532,
            7:  4532,
            default: 3096
        }
    }
};

// ══════════════════════════════════════════════════════════════
// ENGINE: Exhaustive 2D Guillotine Search
// ══════════════════════════════════════════════════════════════

/**
 * Given a rectangle (w × h) and a box (p × q), returns the maximum
 * number of boxes that fit using a single-orientation tiling.
 */
function singleOri(rectW, rectH, p, q) {
    if (rectW <= 0 || rectH <= 0 || p <= 0 || q <= 0) return 0;
    const A = Math.floor(rectW / p) * Math.floor(rectH / q);  // p horizontal, q vertical
    const B = Math.floor(rectW / q) * Math.floor(rectH / p);  // q horizontal, p vertical
    return Math.max(A, B);
}

/**
 * Exhaustive guillotine cut search:
 * Try every possible horizontal cut (y split) and every possible vertical cut (x split)
 * of the pallet floor. For each sub-rectangle, use best single-orientation tiling.
 * 
 * Returns { maxCount, bestLayout: { type, split, topCount, botCount } }
 */
function exhaustiveGuillotine(palletW, palletH, p, q) {
    let best = { count: 0, layout: null };

    // --- NO SPLIT: just fill the whole thing ---
    const noSplit = singleOri(palletW, palletH, p, q);
    if (noSplit > best.count) {
        const oriA = Math.floor(palletW / p) * Math.floor(palletH / q);
        const oriB = Math.floor(palletW / q) * Math.floor(palletH / p);
        const chosenOri = oriA >= oriB ? 'A' : 'B';
        best = {
            count: noSplit,
            layout: {
                type: 'none',
                ori: chosenOri,
                cols: chosenOri === 'A' ? Math.floor(palletW / p) : Math.floor(palletW / q),
                rows: chosenOri === 'A' ? Math.floor(palletH / q) : Math.floor(palletH / p),
                boxW: chosenOri === 'A' ? p : q,
                boxH: chosenOri === 'A' ? q : p
            }
        };
    }

    // --- HORIZONTAL CUTS (split along y-axis = pallet depth) ---
    // Try every multiple of p and q as a split point
    const hSplits = new Set();
    for (let r = 1; r * p < palletH; r++) hSplits.add(r * p);
    for (let r = 1; r * q < palletH; r++) hSplits.add(r * q);

    for (const y of hSplits) {
        const topH = y;
        const botH = palletH - y;
        const topCount = singleOri(palletW, topH, p, q);
        const botCount = singleOri(palletW, botH, p, q);
        const total = topCount + botCount;
        if (total > best.count) {
            // Determine orientations for reporting
            const tA = Math.floor(palletW/p)*Math.floor(topH/q);
            const tB = Math.floor(palletW/q)*Math.floor(topH/p);
            const bA = Math.floor(palletW/p)*Math.floor(botH/q);
            const bB = Math.floor(palletW/q)*Math.floor(botH/p);
            best = {
                count: total,
                layout: {
                    type: 'hcut',
                    y,
                    topH, botH,
                    topCount, botCount,
                    topOri: tA >= tB ? 'A' : 'B',
                    botOri: bA >= bB ? 'A' : 'B',
                    topCols: tA >= tB ? Math.floor(palletW/p) : Math.floor(palletW/q),
                    topRows: tA >= tB ? Math.floor(topH/q) : Math.floor(topH/p),
                    botCols: bA >= bB ? Math.floor(palletW/p) : Math.floor(palletW/q),
                    botRows: bA >= bB ? Math.floor(botH/q) : Math.floor(botH/p),
                    topBoxW: tA >= tB ? p : q, topBoxH: tA >= tB ? q : p,
                    botBoxW: bA >= bB ? p : q, botBoxH: bA >= bB ? q : p
                }
            };
        }
    }

    // --- VERTICAL CUTS (split along x-axis = fuselage width) ---
    const vSplits = new Set();
    for (let c = 1; c * p < palletW; c++) vSplits.add(c * p);
    for (let c = 1; c * q < palletW; c++) vSplits.add(c * q);

    for (const x of vSplits) {
        const leftW = x;
        const rightW = palletW - x;
        const leftCount = singleOri(leftW, palletH, p, q);
        const rightCount = singleOri(rightW, palletH, p, q);
        const total = leftCount + rightCount;
        if (total > best.count) {
            const lA = Math.floor(leftW/p)*Math.floor(palletH/q);
            const lB = Math.floor(leftW/q)*Math.floor(palletH/p);
            const rA = Math.floor(rightW/p)*Math.floor(palletH/q);
            const rB = Math.floor(rightW/q)*Math.floor(palletH/p);
            best = {
                count: total,
                layout: {
                    type: 'vcut',
                    x,
                    leftW, rightW,
                    leftCount, rightCount,
                    leftOri: lA >= lB ? 'A' : 'B',
                    rightOri: rA >= rB ? 'A' : 'B',
                    leftCols: lA >= lB ? Math.floor(leftW/p) : Math.floor(leftW/q),
                    leftRows: lA >= lB ? Math.floor(palletH/q) : Math.floor(palletH/p),
                    rightCols: rA >= rB ? Math.floor(rightW/p) : Math.floor(rightW/q),
                    rightRows: rA >= rB ? Math.floor(palletH/q) : Math.floor(palletH/p),
                    leftBoxW: lA >= lB ? p : q, leftBoxH: lA >= lB ? q : p,
                    rightBoxW: rA >= rB ? p : q, rightBoxH: rA >= rB ? q : p
                }
            };
        }
    }

    return best;
}

// ══════════════════════════════════════════════════════════════
// ASCII GRID VISUALIZER
// ══════════════════════════════════════════════════════════════

function drawGrid(palletW, palletH, layout, boxH, p, q, label) {
    // Scale down for display: 1 char = 10cm
    const scale = 10;
    const cols = Math.floor(palletW / scale);
    const rows = Math.floor(palletH / scale);
    const grid = Array.from({ length: rows }, () => Array(cols).fill('·'));

    let boxNum = 0;

    function fillRect(x0, y0, w, h, bw, bh, startNum) {
        let num = startNum;
        for (let row = 0; row * bh < h; row++) {
            for (let col = 0; col * bw < w; col++) {
                const px = Math.round(x0 / scale) + col * Math.round(bw / scale);
                const py = Math.round(y0 / scale) + row * Math.round(bh / scale);
                const pw2 = Math.round(bw / scale);
                const ph2 = Math.round(bh / scale);
                const symbol = (num % 10).toString();
                // Draw a box outline
                for (let r = 0; r < ph2 && py + r < rows; r++) {
                    for (let c = 0; c < pw2 && px + c < cols; c++) {
                        if (r === 0 || r === ph2 - 1) grid[py + r][px + c] = '─';
                        else if (c === 0 || c === pw2 - 1) grid[py + r][px + c] = '│';
                        else grid[py + r][px + c] = ' ';
                    }
                }
                // Put box number in center
                const midR = Math.floor(ph2 / 2) + py;
                const midC = Math.floor(pw2 / 2) + px;
                if (midR < rows && midC < cols) grid[midR][midC] = symbol;
                num++;
            }
        }
        return num;
    }

    const charW = p <= q ? p : q; // use smaller as "width"
    const charH = p <= q ? q : p;

    if (!layout || layout.type === 'none') {
        const bw = layout.boxW;
        const bh = layout.boxH;
        fillRect(0, 0, palletW, palletH, bw, bh, 1);
    } else if (layout.type === 'hcut') {
        const n = fillRect(0, 0, palletW, layout.topH, layout.topBoxW, layout.topBoxH, 1);
        // Draw cut line
        const cutY = Math.round(layout.topH / scale);
        if (cutY < rows) for (let c = 0; c < cols; c++) grid[cutY][c] = '═';
        fillRect(0, layout.topH, palletW, layout.botH, layout.botBoxW, layout.botBoxH, n);
    } else if (layout.type === 'vcut') {
        const n = fillRect(0, 0, layout.leftW, palletH, layout.leftBoxW, layout.leftBoxH, 1);
        const cutX = Math.round(layout.leftW / scale);
        if (cutX < cols) for (let r = 0; r < rows; r++) grid[r][cutX] = '║';
        fillRect(layout.leftW, 0, layout.rightW, palletH, layout.rightBoxW, layout.rightBoxH, n);
    }

    // Build top border
    const line = '┌' + '─'.repeat(cols) + '┐';
    const bot  = '└' + '─'.repeat(cols) + '┘';
    console.log(`\n  ${label}  [${palletW}cm × ${palletH}cm pallet | box ${p}×${q}×${boxH}cm]`);
    console.log('  ' + line);
    grid.forEach(row => {
        console.log('  │' + row.join('') + '│');
    });
    console.log('  ' + bot);
    console.log(`  ↑ long axis (${palletH}cm)  → cross axis (${palletW}cm)   scale ≈ 1 char = ${scale}cm`);
}

// ══════════════════════════════════════════════════════════════
// MAIN ANALYSIS
// ══════════════════════════════════════════════════════════════

function analyzeBox(box, palletKey, palletCfg) {
    const { cross: CW, long: CL, maxH, netLimits } = palletCfg;

    console.log('\n' + '═'.repeat(72));
    console.log(` PALLET: ${palletKey}   (${CW}cm cross × ${CL}cm long × ${maxH}cm max height)`);
    console.log(` BOX:    ${box.l}×${box.w}×${box.h} cm  |  ${box.weight} kg  |  tipping: ${box.allowTipping}`);
    console.log('═'.repeat(72));

    // Get all unique height variants
    const dims = [box.l, box.w, box.h];
    const possibleHeights = box.allowTipping
        ? [...new Set(dims)].sort((a, b) => a - b)
        : [box.h];

    let overallBest = { totalGeometric: 0, summary: null };

    for (const h of possibleHeights) {
        const remaining = dims.filter((_, i) => dims.indexOf(_) !== i || dims[i] !== h);
        const floorDims = dims.slice();
        const hIdx = floorDims.indexOf(h);
        floorDims.splice(hIdx, 1);
        const p = Math.min(...floorDims);
        const q = Math.max(...floorDims);

        // How many layers of height h fit?
        const maxLayers = Math.floor(maxH / h);
        if (maxLayers === 0) {
            console.log(`\n  h=${h}cm: TOO TALL for this pallet (max ${maxH}cm)`);
            continue;
        }

        // Find best single-layer arrangement
        const result = exhaustiveGuillotine(CW, CL, p, q);
        const perLayer = result.count;
        const totalGeometric = perLayer * maxLayers;

        console.log(`\n  ── Height variant h=${h}cm (floor: ${p}×${q}cm) ──`);
        console.log(`     Max layers stackable:  ${maxLayers}  (${maxLayers}×${h}=${maxLayers*h}cm of ${maxH}cm used)`);
        console.log(`     Max per layer (geo):   ${perLayer}`);
        console.log(`     Total geometric max:   ${totalGeometric} boxes`);

        // Describe the layout
        const lo = result.layout;
        if (lo) {
            if (lo.type === 'none') {
                console.log(`     Layout: Single orientation ${lo.ori === 'A' ? `(${p}×${q})` : `(${q}×${p})`} — ${lo.cols} cols × ${lo.rows} rows`);
            } else if (lo.type === 'hcut') {
                console.log(`     Layout: Horizontal cut at y=${lo.y}cm:`);
                console.log(`       ┌ Top strip ${CW}×${lo.topH}cm: ${lo.topCols} cols × ${lo.topRows} rows (box ${lo.topBoxW}×${lo.topBoxH}) = ${lo.topCount} boxes`);
                console.log(`       └ Bot strip ${CW}×${lo.botH}cm: ${lo.botCols} cols × ${lo.botRows} rows (box ${lo.botBoxW}×${lo.botBoxH}) = ${lo.botCount} boxes`);
            } else if (lo.type === 'vcut') {
                console.log(`     Layout: Vertical cut at x=${lo.x}cm:`);
                console.log(`       ├ Left strip ${lo.leftW}×${CL}cm: ${lo.leftCols} cols × ${lo.leftRows} rows (box ${lo.leftBoxW}×${lo.leftBoxH}) = ${lo.leftCount} boxes`);
                console.log(`       └ Right strip ${lo.rightW}×${CL}cm: ${lo.rightCols} cols × ${lo.rightRows} rows (box ${lo.rightBoxW}×${lo.rightBoxH}) = ${lo.rightCount} boxes`);
            }
        }

        // Weight limit per position
        console.log(`\n     Weight analysis (${box.weight} kg each):`);
        console.log(`     ${'Pos'.padEnd(8)} ${'Net Limit'.padEnd(12)} ${'Max Boxes (wt)'.padEnd(16)} ${'Max Boxes (geo)'.padEnd(17)} ${'ACTUAL MAX'}`);
        console.log(`     ${'─'.repeat(65)}`);

        const positions = [1, 2, 8, 9];
        for (const pos of positions) {
            const netLimit = netLimits[pos] ?? netLimits.default;
            const byWeight = Math.floor(netLimit / box.weight);
            const actual = Math.min(perLayer * maxLayers, byWeight);
            const limiting = byWeight < perLayer * maxLayers ? '⚠ weight-limited' : '✓ space-limited';
            console.log(`     Pos ${String(pos).padEnd(4)}   ${String(netLimit).padEnd(11)}kg  ${String(byWeight).padEnd(16)} ${String(perLayer * maxLayers).padEnd(17)} ${actual}  ${limiting}`);
        }
        // Standard position
        const stdNet = netLimits.default;
        const stdByWt = Math.floor(stdNet / box.weight);
        const stdActual = Math.min(perLayer * maxLayers, stdByWt);
        console.log(`     Pos std  ${String(stdNet).padEnd(11)}kg  ${String(stdByWt).padEnd(16)} ${String(perLayer * maxLayers).padEnd(17)} ${stdActual}  standard`);

        // Draw ASCII grid for best layer layout (only if it fits well)
        if (perLayer > 0 && CW <= 400 && CL <= 300) {
            drawGrid(CW, CL, lo, h, p, q, `${palletKey} h=${h}cm`);
        }

        if (totalGeometric > overallBest.totalGeometric) {
            overallBest = {
                height: h, p, q, perLayer, maxLayers, totalGeometric,
                layout: lo, netLimits
            };
        }
    }

    // ── SUMMARY ──
    const ob = overallBest;
    if (ob.perLayer === 0) {
        console.log('\n❌ Box does not fit on this pallet.');
        return;
    }

    console.log('\n' + '─'.repeat(72));
    console.log(` CONCLUSION for ${palletKey}:`);
    console.log(`   Best orientation: h=${ob.height}cm standing up`);
    console.log(`   Floor footprint:  ${ob.p}cm × ${ob.q}cm`);
    console.log(`   Per layer:        ${ob.perLayer} boxes (geometric max)`);
    console.log(`   Layers:           ${ob.maxLayers}`);
    console.log(`   Geo total:        ${ob.totalGeometric} boxes per pallet`);

    const positions = Object.keys(ob.netLimits).filter(k => k !== 'default').map(Number).sort();
    for (const pos of positions) {
        const net = ob.netLimits[pos];
        const actual = Math.min(ob.totalGeometric, Math.floor(net / BOX.weight));
        console.log(`   Position ${pos} (${net}kg net):  → ${actual} boxes  (${actual * BOX.weight}kg)`);
    }
    const stdNet = ob.netLimits.default;
    const stdActual = Math.min(ob.totalGeometric, Math.floor(stdNet / BOX.weight));
    console.log(`   Standard pos (${stdNet}kg net): → ${stdActual} boxes  (${stdActual * BOX.weight}kg)`);
    console.log('─'.repeat(72));
}

// ══════════════════════════════════════════════════════════════
// RUN
// ══════════════════════════════════════════════════════════════

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║         PALLET GEOMETRY CHECKER — Independent Brute-Force          ║');
console.log('║   Finds the THEORETICAL MAXIMUM boxes per pallet exhaustively       ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');

console.log(`\n📦 Box: ${BOX.l} × ${BOX.w} × ${BOX.h} cm  |  ${BOX.weight} kg  |  Tipping: ${BOX.allowTipping}`);

for (const [key, cfg] of Object.entries(PALLETS)) {
    analyzeBox(BOX, key, cfg);
}
