/**
 * SkyGuard Cargo Packer Logic
 * Ported from cargo_calculator.py - High Fidelity Version
 */

// Weight (kg) of the permanently installed technical kit in the AFT lower deck (C4):
// Spare nose wheel (1), spare main wheel (1), and jack (1) — by airline management decision.
// This applies to BOTH aircraft (UK75057 and UK75058).
const TECH_KIT_WEIGHT_KG = 300;

// Belly holds have no loading equipment — ground crew load every box by hand
// through the hatch, so a single box may not exceed this weight.
const LOWER_DECK_MAX_BOX_KG = 75;

const CONFIG = {
    AIRCRAFT_NAME: "Boeing 757-200 PCF",
    MAX_FUSELAGE_HEIGHT_CM: 205,
    DOOR_MAIN: { width: 340, height: 218 },
    DOOR_FWD_BELLY: { width: 140, height: 108 },
    DOOR_AFT_BELLY: { width: 140, height: 112 },

    PALLET_OPTIONS: {
        PAG: {
            code: "PAG",
            name: "PAG (High) - 15 positions",
            count: 15,
            length_cross: 301,  // real measured usable cm
            width_long: 209,    // real measured usable cm
            max_height: 205,
            tare_weight: 110,
            contour_start_height: 114.3,
            contour_mid_height: 174.5,
            width_base: 304.0,
            width_fuselage_start: 317.0,
            width_mid_taper: 223.0,
            width_top: 117.0,
            weight_limits: { 1: 2716, 8: 4264, 9: 4264 },
            default_weight: 2948
        },
        PMC: {
            code: "PMC",
            name: "PMC (Wide) - 13 positions",
            count: 13,
            length_cross: 301,  // real measured usable cm
            width_long: 229,    // real measured usable cm
            max_height: 205,
            tare_weight: 120,
            contour_start_height: 114.3,
            contour_mid_height: 174.5,
            width_base: 304.0,
            width_fuselage_start: 317.0,
            width_mid_taper: 223.0,
            width_top: 117.0,
            weight_limits: { 1: 2856, 6: 4652, 7: 4652 },
            default_weight: 3216
        }
    },

    LOWER_DECK: [
        {
            id: "FWD",
            name: "FWD HOLD",
            max_weight: 7142,
            door: { width: 140, height: 108 },
            floor_width_cm: 120,
            compartments: [
                {
                    id: "C1", name: "C1 (FWD)",
                    max_weight: 2470, max_volume: 5.2,
                    max_length_cm: 295, max_height_cm: 108,
                    obstacles: [{ l: 140, w: 72, h: 134, name: "Structural Block" }]
                },
                {
                    id: "C2", name: "C2 (FWD)",
                    max_weight: 4672, max_volume: 14.6,
                    max_length_cm: 560, max_height_cm: 108,
                    obstacles: [{ l: 97, w: 70, h: 27, name: "Corner Protrusion" }]
                }
            ]
        },
        {
            id: "AFT",
            name: "AFT HOLD",
            max_weight: 9079,
            door: { width: 140, height: 112 },
            floor_width_cm: 120,
            min_floor_width_cm: 90,
            compartments: [
                {
                    id: "C3", name: "C3 (AFT)",
                    max_weight: 3733, max_volume: 14.25,
                    max_length_cm: 440, max_height_cm: 112
                },
                {
                    id: "C4", name: "C4 (AFT)",
                    // max_weight reduced by TECH_KIT_WEIGHT_KG (300 kg) for permanently installed
                    // spare wheels and jack stored in the rear lower baggage compartment.
                    max_weight: 5306 - TECH_KIT_WEIGHT_KG, // = 5006 kg available for cargo
                    max_volume: 30.7,
                    // Structural obstacle occupies 238 cm at the START (nose side) of C4.
                    // Usable cargo length = 608 - 238 = 370 cm.
                    max_length_cm: 608 - 238, // = 370 cm usable
                    max_height_cm: 112,
                    obstacles: [{ l: 238, w: 72, h: 134, name: "Structural Block" }],
                    tech_kit_reserved_kg: TECH_KIT_WEIGHT_KG
                }
            ]
        }
    ],

    AIRCRAFT_SPEC: {
        "UK75057": { name: "UK75057", max_gross_payload: 36513 },
        "UK75058": { name: "UK75058", max_gross_payload: 35818 }
    }
};

const FUSELAGE_PROFILES = {
    NOSE: [
        [0, 317], [120, 301], [135, 285], [140, 275], [145, 270],
        [150, 265], [155, 260], [160, 250], [165, 245], [170, 240],
        [175, 230], [180, 220], [185, 210], [190, 195], [195, 180],
        [200, 160], [205, 140]
    ],
    MIDDLE: [
        [0, 317], [140, 301], [165, 275], [170, 260], [175, 255],
        [180, 245], [185, 235], [190, 225], [195, 215], [200, 200],
        [205, 185]
    ],
    TAIL: [
        [0, 317], [120, 301], [135, 285], [140, 275], [145, 265],
        [150, 255], [155, 250], [160, 240], [165, 235], [170, 225],
        [175, 215], [180, 205], [185, 195], [190, 185], [195, 170],
        [200, 150], [205, 140]
    ]
};

// Pre-sort profiles once at module load so getFuselageWidthFromProfile doesn't sort on every call
Object.keys(FUSELAGE_PROFILES).forEach(k => FUSELAGE_PROFILES[k].sort((a, b) => a[0] - b[0]));

function getFuselageWidthFromProfile(heightCm, zone) {
    const sorted = FUSELAGE_PROFILES[zone] || FUSELAGE_PROFILES.MIDDLE;
    if (heightCm <= sorted[0][0]) return sorted[0][1];
    if (heightCm >= sorted[sorted.length - 1][0]) return sorted[sorted.length - 1][1];
    for (let i = 0; i < sorted.length - 1; i++) {
        const [h0, w0] = sorted[i];
        const [h1, w1] = sorted[i + 1];
        if (heightCm >= h0 && heightCm <= h1) {
            const t = (heightCm - h0) / (h1 - h0);
            return w0 + t * (w1 - w0);
        }
    }
    return 0;
}

class CargoItem {
    constructor(id, name, length, width, height, weight, count, allowTipping = false, noStack = false) {
        this.id = id;
        this.name = name;
        // Store raw dimensions explicitly so spread-clones pass correct values to packAircraft()
        this.length = length;
        this.width = width;
        this.height = height;
        this.dims = [length, width, height].sort((a, b) => a - b);
        this.originalDims = [length, width, height];
        this.weight = weight;
        this.count = count;
        this.allowTipping = allowTipping;
        this.noStack = noStack || false;
        this.volumeM3 = (length * width * height) / 1000000.0;
    }

    getVariants() {
        let variants = [];
        let possibleHeights = this.allowTipping ? Array.from(new Set(this.dims)) : [this.originalDims[2]];

        for (let h of possibleHeights) {
            let remDims = [...this.originalDims];
            let idx = remDims.indexOf(h);
            if (idx > -1) remDims.splice(idx, 1);
            else {
                let temp = [...this.dims];
                temp.splice(temp.indexOf(h), 1);
                remDims = temp;
            }
            let l = Math.max(...remDims);
            let w = Math.min(...remDims);
            variants.push({ l, w, h, weight: this.weight, name: this.name, ref: this });
        }
        return variants;
    }
}

class Pallet {
    constructor(id, config) {
        this.id = id;
        this.config = config;
        this.maxGrossWeight = config.weight_limits[id] || config.default_weight;
        this.tareWeight = config.tare_weight;
        this.maxNetWeight = this.maxGrossWeight - this.tareWeight;
        this.currentWeight = 0;
        this.currentHeight = 0;
        this.layers = [];
        
        if (id === 1) this.zone = 'NOSE';
        else if ((config.code === "PMC" && id === 13) || (config.code === "PAG" && id === 15)) this.zone = 'TAIL';
        else this.zone = 'MIDDLE';
    }

    getFuselageWidth(heightCm) {
        return Math.min(this.config.length_cross, getFuselageWidthFromProfile(heightCm, this.zone));
    }

    remainingWeight() { return this.maxNetWeight - this.currentWeight; }
}

const Packer = {
    // Check if item can physically pass through a door opening.
    // item.dims is sorted ascending [smallest, mid, largest].
    // For an item to fit through a door, its two smallest dimensions must
    // be <= the door's two dimensions (in some orientation).
    fitsThroughDoor: (item, door) => {
        const [i_min, i_mid] = item.dims; // item.dims sorted asc; largest dim is depth along cargo direction
        const d_min = Math.min(door.width, door.height);
        const d_max = Math.max(door.width, door.height);
        return i_min <= d_min && i_mid <= d_max;
    },

    calculateLayer: (pallet, variant) => {
        let checkHeight = pallet.currentHeight + variant.h;
        if (checkHeight > pallet.config.max_height) return null;

        let fuselageW = pallet.getFuselageWidth(checkHeight);
        let availCross = Math.min(pallet.config.length_cross, fuselageW);
        let availLong = pallet.config.width_long;

        if (availCross < Math.min(variant.l, variant.w)) return null;

        /**
         * Enhanced Two-Block Partitioning for Identical Rectangles
         * Tries various ways to split the area into two blocks and fill each with different orientations.
         */
        function tryPartition(dimCross, dimLong) {
            let bestSplit = { total: 0, meta: { main: { r: 0, c: 0 }, side: null } };

            // 1. Vertical Split: Primary grid on the left, rotated items on the right gap
            let colsV = Math.floor(availCross / dimCross);
            let rowsV = Math.floor(availLong / dimLong);
            if (colsV >= 1 && rowsV >= 1) {
                let totalV = colsV * rowsV;
                let remWidth = availCross - (colsV * dimCross);
                let sideV = null;
                if (remWidth >= dimLong && availLong >= dimCross) {
                    let sCols = Math.floor(remWidth / dimLong);
                    let sRows = Math.floor(availLong / dimCross);
                    sideV = { r: sRows, c: sCols, count: sCols * sRows };
                    totalV += sideV.count;
                }
                if (totalV > bestSplit.total) {
                    bestSplit = { total: totalV, meta: { main: { r: rowsV, c: colsV }, side: sideV } };
                }
            }

            // 2. Horizontal Split: Primary grid at the bottom, rotated items in the top gap
            let rowsH = Math.floor(availLong / dimLong);
            let colsH = Math.floor(availCross / dimCross);
            if (rowsH >= 1 && colsH >= 1) {
                let totalH = rowsH * colsH;
                let remLength = availLong - (rowsH * dimLong);
                let sideH = null;
                if (remLength >= dimCross && availCross >= dimLong) {
                    let sRows = Math.floor(remLength / dimCross);
                    let sCols = Math.floor(availCross / dimLong);
                    sideH = { r: sRows, c: sCols, count: sCols * sRows, type: 'HORIZONTAL' };
                    totalH += sideH.count;
                }
                if (totalH > bestSplit.total) {
                    bestSplit = { total: totalH, meta: { main: { r: rowsH, c: colsH }, side: sideH } };
                }
            }

            return bestSplit;
        }

        let a = tryPartition(variant.l, variant.w);
        let b = tryPartition(variant.w, variant.l);
        let best = a.total >= b.total ? { ...a, type: 'A' } : { ...b, type: 'B' };

        if (best.total === 0) return null;
        return {
            count: best.total,
            height: variant.h,
            weight: variant.weight,
            name: variant.name,
            meta: best.meta,
            orientType: best.type,
            dim_cross: best.type === 'A' ? variant.l : variant.w,
            dim_long: best.type === 'A' ? variant.w : variant.l
        };
    },

    // Simulates stacking a variant from the pallet's current height up to max_height,
    // re-checking calculateLayer at each successive z so fuselage taper (which shrinks
    // available width at greater height) is accounted for rather than assumed uniform.
    // Returns the true achievable total count and the first layer's result (what
    // actually gets applied this iteration).
    simulateFullStack: (pallet, item, variant) => {
        let h = pallet.currentHeight;
        let total = 0;
        let first = null;
        while (true) {
            const pseudoPallet = { config: pallet.config, currentHeight: h, getFuselageWidth: pallet.getFuselageWidth.bind(pallet) };
            let res = Packer.calculateLayer(pseudoPallet, variant);
            if (!res) break;
            total += res.count;
            if (!first) first = res;
            h += variant.h;
            if (item.noStack) break;
        }
        return { total, first };
    },

    // ─────────────────────────────────────────────────────────────────────
    //  MIXED-TIER PACKING CORE
    //
    //  Both the main-deck pallets and the belly compartments are packed as a
    //  stack of horizontal tiers, and a tier may hold SEVERAL different box
    //  types side by side. Previously one tier held one box type, so a single
    //  small carton consumed the entire footprint for its full height — which
    //  is why a 70 m³ manifest did not fit into a 250 m³ aircraft.
    //
    //  A "container" is anything with a floor and a ceiling:
    //    { crossWidth, longLength, maxHeight, currentHeight }
    //  where crossWidth may be a function of height (fuselage taper on a pallet)
    //  or a plain number (constant belly floor width).
    // ─────────────────────────────────────────────────────────────────────

    containerWidthAt: (container, z) =>
        typeof container.crossWidth === 'function' ? container.crossWidth(z) : container.crossWidth,

    // All footprints an item can present once a variant has fixed which
    // dimension points up: the other two may still be laid either way round.
    footprintsFor: (variant) => {
        if (variant.l === variant.w) return [{ w: variant.l, l: variant.w }];
        return [
            { w: variant.l, l: variant.w },   // long side across
            { w: variant.w, l: variant.l }    // long side along
        ];
    },

    // MaxRects free-space update: every free rectangle that the newly placed box
    // overlaps is cut into the (up to four) maximal rectangles that remain, then
    // rectangles fully contained in another are dropped. Keeping MAXIMAL — i.e.
    // overlapping — free rectangles is what lets the packer mix orientations in
    // one tier; a plain guillotine split loses roughly one box in five.
    rectContains: (inner, outer) =>
        inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6 &&
        inner.x + inner.w <= outer.x + outer.w + 1e-6 &&
        inner.y + inner.l <= outer.y + outer.l + 1e-6,

    updateFreeRects: (freeList, used) => {
        const out = [];
        for (const fr of freeList) {
            const disjoint = used.x >= fr.x + fr.w - 1e-6 || used.x + used.w <= fr.x + 1e-6 ||
                             used.y >= fr.y + fr.l - 1e-6 || used.y + used.l <= fr.y + 1e-6;
            if (disjoint) { out.push(fr); continue; }
            if (used.x > fr.x + 1e-6)
                out.push({ x: fr.x, y: fr.y, w: used.x - fr.x, l: fr.l });
            if (used.x + used.w < fr.x + fr.w - 1e-6)
                out.push({ x: used.x + used.w, y: fr.y, w: fr.x + fr.w - used.x - used.w, l: fr.l });
            if (used.y > fr.y + 1e-6)
                out.push({ x: fr.x, y: fr.y, w: fr.w, l: used.y - fr.y });
            if (used.y + used.l < fr.y + fr.l - 1e-6)
                out.push({ x: fr.x, y: used.y + used.l, w: fr.w, l: fr.y + fr.l - used.y - used.l });
        }

        const kept = [];
        for (let i = 0; i < out.length; i++) {
            if (out[i].w < 0.01 || out[i].l < 0.01) continue;
            let redundant = false;
            for (let j = 0; j < out.length; j++) {
                if (i === j || out[j].w < 0.01 || out[j].l < 0.01) continue;
                if (Packer.rectContains(out[i], out[j])) {
                    // Identical rectangles contain each other — keep the first only.
                    if (!Packer.rectContains(out[j], out[i]) || j < i) { redundant = true; break; }
                }
            }
            if (!redundant) kept.push(out[i]);
        }
        return kept;
    },

    /**
     * Optimal regular layout for a run of IDENTICAL rectangles: a main grid plus
     * an optional 90°-rotated block in the leftover strip. For uniform cargo this
     * beats any incremental placement, so a tier is seeded with it.
     * Returns explicit { x, y, w, l } positions.
     */
    gridLayout: (availCross, availLong, fpA, fpB) => {
        let best = [];
        const consider = (dimCross, dimLong, rotCross, rotLong) => {
            const cols = Math.floor(availCross / dimCross);
            const rows = Math.floor(availLong / dimLong);
            if (cols < 1 || rows < 1) return;

            const layout = [];
            for (let r = 0; r < rows; r++)
                for (let c = 0; c < cols; c++)
                    layout.push({ x: c * dimCross, y: r * dimLong, w: dimCross, l: dimLong });

            // Rotated block in the strip left over across the container
            const remCross = availCross - cols * dimCross;
            if (rotCross > 0 && remCross >= rotCross && availLong >= rotLong) {
                const sCols = Math.floor(remCross / rotCross);
                const sRows = Math.floor(availLong / rotLong);
                for (let r = 0; r < sRows; r++)
                    for (let c = 0; c < sCols; c++)
                        layout.push({ x: cols * dimCross + c * rotCross, y: r * rotLong, w: rotCross, l: rotLong });
            }

            // Rotated block in the strip left over along the container
            const remLong = availLong - rows * dimLong;
            if (rotLong > 0 && remLong >= rotLong && availCross >= rotCross) {
                const sRows = Math.floor(remLong / rotLong);
                const sCols = Math.floor(availCross / rotCross);
                for (let r = 0; r < sRows; r++)
                    for (let c = 0; c < sCols; c++)
                        layout.push({ x: c * rotCross, y: rows * dimLong + r * rotLong, w: rotCross, l: rotLong });
            }

            if (layout.length > best.length) best = layout;
        };

        consider(fpA.w, fpA.l, fpB.w, fpB.l);
        if (fpB) consider(fpB.w, fpB.l, fpA.w, fpA.l);
        return best;
    },

    /**
     * Fills ONE tier of a container with a mix of box types.
     *
     * @param {Object} container  { crossWidth, longLength, maxHeight, currentHeight }
     * @param {number} tierHeight vertical space this tier consumes
     * @param {Array}  candidates [{ item, variant }] usable in this container
     * @param {Object} caps       { weightRemaining, grossRemaining, volumeRemaining }
     * @param {boolean} seedGrid  start from the optimal grid of the largest box type
     * @returns {Object|null} { placements, placedWeight, placedVolume, height, availCross }
     */
    fillTier: (container, tierHeight, candidates, caps, seedGrid) => {
        const topZ = container.currentHeight + tierHeight;
        if (topZ > container.maxHeight + 0.001) return null;

        // The usable width is the narrowest point the stack reaches, i.e. the
        // width at the TOP of the tier (matters where the fuselage tapers).
        const availCross = Packer.containerWidthAt(container, topZ);
        const availLong = container.longLength;
        if (availCross <= 0 || availLong <= 0) return null;

        // Biggest footprints first, so large boxes claim open floor before
        // small ones fragment it.
        const entries = candidates
            .filter(c => c.variant.h <= tierHeight + 0.001)
            .map(c => ({
                item: c.item,
                variant: c.variant,
                footprints: Packer.footprintsFor(c.variant),
                taken: 0
            }))
            .filter(e => e.footprints.some(fp => fp.w <= availCross && fp.l <= availLong))
            .sort((a, b) => {
                const areaA = a.variant.l * a.variant.w, areaB = b.variant.l * b.variant.w;
                if (areaB !== areaA) return areaB - areaA;
                return b.variant.h - a.variant.h;
            });

        if (!entries.length) return null;

        let free = [{ x: 0, y: 0, w: availCross, l: availLong }];
        const placements = [];
        let placedWeight = 0, placedVolume = 0;

        // Cargo is centred across the container, so any taper stays symmetric.
        const crossOffset = (Packer.containerWidthAt(container, 0) - availCross) / 2;

        // Stock is shared between entries of the same item (one entry per
        // variant), so track consumption per item as well as per entry.
        const usedPerItem = new Map();

        const admit = (e, pos) => {
            const unitVolume = (e.variant.l * e.variant.w * e.variant.h) / 1000000;
            const alreadyUsed = usedPerItem.get(e.item) || 0;
            if (e.item.count - alreadyUsed <= 0) return false;
            if (placedWeight + e.variant.weight > caps.weightRemaining + 0.001) return false;
            if (placedWeight + e.variant.weight > caps.grossRemaining + 0.001) return false;
            if (caps.volumeRemaining !== undefined &&
                placedVolume + unitVolume > caps.volumeRemaining + 1e-9) return false;

            placements.push({
                item: e.item,
                name: e.variant.name,
                x: crossOffset + pos.x,
                y: pos.y,
                w: pos.w,
                l: pos.l,
                h: e.variant.h,
                weight: e.variant.weight
            });
            free = Packer.updateFreeRects(free, pos);
            usedPerItem.set(e.item, alreadyUsed + 1);
            placedWeight += e.variant.weight;
            placedVolume += unitVolume;
            return true;
        };

        // Seed with the optimal regular grid of the largest box type. For a
        // uniform manifest this alone is the answer; for a mixed one the
        // remaining gaps are filled incrementally below.
        if (seedGrid) {
            const e = entries[0];
            const fps = e.footprints.filter(fp => fp.w <= availCross && fp.l <= availLong);
            if (fps.length) {
                const layout = Packer.gridLayout(availCross, availLong, fps[0], fps[1] || fps[0]);
                for (const pos of layout) if (!admit(e, pos)) break;
            }
        }

        let progress = true;
        while (progress) {
            progress = false;
            for (const e of entries) {
                if (e.item.count - (usedPerItem.get(e.item) || 0) <= 0) continue;

                // Best short-side fit over every free rectangle / orientation
                let best = null;
                for (let i = 0; i < free.length; i++) {
                    const fr = free[i];
                    for (const fp of e.footprints) {
                        if (fp.w > fr.w + 0.001 || fp.l > fr.l + 0.001) continue;
                        const leftover = Math.min(fr.w - fp.w, fr.l - fp.l);
                        if (!best || leftover < best.leftover) best = { idx: i, fp, leftover };
                    }
                }
                if (!best) continue;

                const fr = free[best.idx];
                if (!admit(e, { x: fr.x, y: fr.y, w: best.fp.w, l: best.fp.l })) continue;
                progress = true;
                break; // restart from the biggest box again
            }
        }

        if (!placements.length) return null;
        return { placements, placedWeight, placedVolume, height: tierHeight, availCross };
    },

    /**
     * Chooses the tier height that packs the most volume per centimetre of
     * stack height — stack height is the scarce resource — and returns that tier.
     *
     * @param {Function} variantFilter optional (item, variant) => boolean
     */
    buildBestTier: (container, items, caps, variantFilter) => {
        const headroom = container.maxHeight - container.currentHeight;
        if (headroom <= 0) return null;

        const candidates = [];
        const heightSet = new Set();
        for (const item of items) {
            if (item.count <= 0) continue;
            if (item.weight > caps.weightRemaining || item.weight > caps.grossRemaining) continue;
            for (const variant of item.getVariants()) {
                if (variant.h > headroom + 0.001) continue;
                if (variantFilter && !variantFilter(item, variant)) continue;
                candidates.push({ item, variant });
                heightSet.add(variant.h);
            }
        }
        if (!candidates.length) return null;

        // Trying every distinct height is wasteful on large manifests; a spread
        // of them finds the same answer in practice.
        let heights = Array.from(heightSet).sort((a, b) => b - a);
        if (heights.length > 24) {
            const step = heights.length / 24;
            const sampled = [];
            for (let i = 0; i < 24; i++) sampled.push(heights[Math.floor(i * step)]);
            heights = Array.from(new Set(sampled));
        }

        let best = null, bestScore = -1;
        for (const h of heights) {
            // Grid-seeded and free-form fills win in different situations
            // (uniform vs. mixed cargo), so try both and keep the fuller tier.
            for (const seedGrid of [true, false]) {
                const tier = Packer.fillTier(container, h, candidates, caps, seedGrid);
                if (!tier) continue;
                const score = tier.placedVolume / h;   // m³ gained per cm of height
                if (score > bestScore) { bestScore = score; best = tier; }
            }
        }
        return best;
    },

    // Groups a tier's individual placements into per-box-type rows for reports.
    summariseTier: (placements) => {
        const byType = new Map();
        for (const pl of placements) {
            const key = `${pl.name}_${pl.w}x${pl.l}x${pl.h}`;
            if (byType.has(key)) byType.get(key).count++;
            else byType.set(key, { name: pl.name, w: pl.w, l: pl.l, h: pl.h, weight: pl.weight, count: 1 });
        }
        return Array.from(byType.values()).sort((a, b) => b.count - a.count);
    },
    packAircraft: (configCode, cargoItems, options = {}) => {
        const config = CONFIG.PALLET_OPTIONS[configCode];
        const aircraftId = options.aircraftId || "UK75057";
        const maxGrossLimit = CONFIG.AIRCRAFT_SPEC[aircraftId]?.max_gross_payload || 999999;
        const mainDeckOnlyGlobal = options.mainDeckOnly || false;

        let currentTotalGross = config.count * config.tare_weight;

        // --- PRE-PROCESS: GROUP & CLASSIFY ITEMS ---
        let groupedItemsMap = new Map();
        for (let i of cargoItems) {
            if (i.count <= 0) continue;
            let key = `${i.length}_${i.width}_${i.height}_${i.weight}_${i.priority || false}_${i.noStack || false}_${i.allowTipping || false}_${i.mainDeckOnly || false}_${i.lowerDeckOnly || false}`;
            if (groupedItemsMap.has(key)) {
                groupedItemsMap.get(key).count += i.count;
            } else {
                groupedItemsMap.set(key, { ...i });
            }
        }
        
        let workingItems = Array.from(groupedItemsMap.values()).map(i => {
            const item = new CargoItem(i.id, i.name, i.length, i.width, i.height, i.weight, i.count, i.allowTipping, i.noStack);
            item.priority = i.priority || false;
            item.mainDeckOnly = i.mainDeckOnly || false;
            item.lowerDeckOnly = i.lowerDeckOnly || false;
            return item;
        });

        // Classification helper — mirrors Packer.fitsThroughDoor logic
        const fitsInAnyLowerDoor = (item) => {
            return CONFIG.LOWER_DECK.some(hold => {
                const [i_min, i_mid] = item.dims; // sorted asc; we check two smallest vs door opening
                const d_min = Math.min(hold.door.width, hold.door.height);
                const d_max = Math.max(hold.door.width, hold.door.height);
                return i_min <= d_min && i_mid <= d_max;
            });
        };

        // Split items based on where they CAN and SHOULD go
        const mustMainItems = workingItems.filter(i => !i.lowerDeckOnly && (i.mainDeckOnly || !fitsInAnyLowerDoor(i)));
        const flexibleItems = workingItems.filter(i => !i.mainDeckOnly && !i.lowerDeckOnly && fitsInAnyLowerDoor(i));
        const mustLowerItems = workingItems.filter(i => i.lowerDeckOnly && fitsInAnyLowerDoor(i));

        // Sorting for Main Deck: Big volume first
        const sortForMain = (items) => items.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority ? -1 : 1;
            return b.volumeM3 - a.volumeM3;
        });

        // --- PASS 1: PACK ON MAIN DECK ---
        let pallets = [];
        for (let i = 1; i <= config.count; i++) {
            pallets.push(new Pallet(i, config));
        }

        const packToPallets = (targetItems) => {
            sortForMain(targetItems);
            for (let p of pallets) {
                // A pallet is a container whose usable width shrinks with height
                // because of the fuselage taper.
                const container = {
                    crossWidth: (z) => Math.min(p.config.length_cross, p.getFuselageWidth(z)),
                    longLength: p.config.width_long,
                    maxHeight: p.config.max_height,
                    currentHeight: p.currentHeight
                };

                while (true) {
                    if (targetItems.every(x => x.count === 0)) break;
                    if (currentTotalGross >= maxGrossLimit) break;
                    if (p.currentHeight >= p.config.max_height) break;

                    container.currentHeight = p.currentHeight;
                    const caps = {
                        weightRemaining: p.remainingWeight(),
                        grossRemaining: maxGrossLimit - currentTotalGross
                    };
                    if (caps.weightRemaining <= 0 || caps.grossRemaining <= 0) break;

                    // Only boxes that clear the main cargo door
                    const tier = Packer.buildBestTier(container, targetItems, caps,
                        (item) => Packer.fitsThroughDoor(item, CONFIG.DOOR_MAIN));
                    if (!tier) break;

                    // Commit: consume stock, weight and stack height
                    let closePallet = false;
                    for (const pl of tier.placements) {
                        pl.item.count -= 1;
                        if (pl.item.noStack) closePallet = true;
                    }

                    p.currentWeight += tier.placedWeight;
                    currentTotalGross += tier.placedWeight;

                    const contents = Packer.summariseTier(tier.placements);
                    const dominant = contents[0];

                    p.layers.push({
                        box_name: contents.length > 1 ? `Mixed — ${contents.length} types` : dominant.name,
                        count: tier.placements.length,
                        height: tier.height,
                        z_start: p.currentHeight,
                        z_end: p.currentHeight + tier.height,
                        weight: dominant.weight,
                        total_weight: tier.placedWeight,
                        placements: tier.placements.map(pl => ({
                            name: pl.name, x: pl.x, y: pl.y, w: pl.w, l: pl.l, h: pl.h, weight: pl.weight
                        })),
                        contents,
                        avail_cross: tier.availCross,
                        meta: { main: { r: 0, c: 0 }, side: null },
                        orient_type: dominant.w >= dominant.l ? 'A' : 'B',
                        dim_cross: dominant.w,
                        dim_long: dominant.l
                    });

                    p.currentHeight += tier.height;
                    if (closePallet) p.currentHeight = p.config.max_height;
                }
            }
        };

        let lowerDeckResults = [];

        // Usable floor width of a belly compartment. The AFT hold narrows toward
        // the tail, so it carries a conservative minimum width.
        const bellyFloorWidth = (hold, compSpec) =>
            compSpec.floor_width_cm || hold.min_floor_width_cm || hold.floor_width_cm;

        const passesHatch = (item, hold) => {
            const [i_min, i_mid] = item.dims;
            const d_min = Math.min(hold.door.width, hold.door.height);
            const d_max = Math.max(hold.door.width, hold.door.height);
            return i_min <= d_min && i_mid <= d_max;
        };

        // Can this box ride in the belly at all — hatch, manual-lift limit, and
        // does it physically fit inside at least one compartment?
        const bellyEligible = (item) => {
            if (item.weight > LOWER_DECK_MAX_BOX_KG) return false;
            return CONFIG.LOWER_DECK.some(hold => {
                if (!passesHatch(item, hold)) return false;
                return hold.compartments.some(cs => {
                    const floorW = bellyFloorWidth(hold, cs);
                    return item.getVariants().some(v =>
                        v.h <= cs.max_height_cm &&
                        Math.min(v.l, v.w) <= floorW &&
                        Math.max(v.l, v.w) <= Math.max(floorW, cs.max_length_cm));
                });
            });
        };

        const packToLowerDeck = (targetItems) => {
            if (mainDeckOnlyGlobal) return;
            for (let hold of CONFIG.LOWER_DECK) {
                let holdRes = lowerDeckResults.find(h => h.name === hold.name);
                if (!holdRes) {
                    holdRes = { name: hold.name, current_weight: 0, compartments: [] };
                    hold.compartments.forEach(comp => {
                        holdRes.compartments.push({
                            id: comp.id, name: comp.name, items: [], tiers: [],
                            weight: 0, volume: 0, height_used: 0,
                            max_weight: comp.max_weight, max_volume: comp.max_volume,
                            max_length_cm: comp.max_length_cm, max_height_cm: comp.max_height_cm,
                            floor_width_cm: bellyFloorWidth(hold, comp)
                        });
                    });
                    lowerDeckResults.push(holdRes);
                }

                for (let compData of holdRes.compartments) {
                    const compSpec = hold.compartments.find(c => c.id === compData.id);

                    // A compartment is a box-shaped container: floor width across,
                    // usable corridor length along, ceiling above.
                    const container = {
                        crossWidth: compData.floor_width_cm,
                        longLength: compSpec.max_length_cm,
                        maxHeight: compSpec.max_height_cm,
                        currentHeight: compData.height_used
                    };

                    while (true) {
                        if (targetItems.every(x => x.count === 0)) break;
                        if (currentTotalGross >= maxGrossLimit) break;
                        if (holdRes.current_weight >= hold.max_weight) break;
                        if (compData.weight >= compSpec.max_weight) break;
                        if (compData.height_used >= compSpec.max_height_cm) break;

                        container.currentHeight = compData.height_used;
                        const caps = {
                            weightRemaining: Math.min(
                                compSpec.max_weight - compData.weight,
                                hold.max_weight - holdRes.current_weight
                            ),
                            grossRemaining: maxGrossLimit - currentTotalGross,
                            volumeRemaining: compSpec.max_volume - compData.volume
                        };
                        if (caps.weightRemaining <= 0 || caps.grossRemaining <= 0 || caps.volumeRemaining <= 0) break;

                        const tier = Packer.buildBestTier(container, targetItems, caps,
                            (item) => passesHatch(item, hold) && item.weight <= LOWER_DECK_MAX_BOX_KG);
                        if (!tier) break;

                        for (const pl of tier.placements) pl.item.count -= 1;

                        const contents = Packer.summariseTier(tier.placements);
                        compData.tiers.push({
                            z_start: compData.height_used,
                            z_end: compData.height_used + tier.height,
                            height: tier.height,
                            count: tier.placements.length,
                            total_weight: tier.placedWeight,
                            placements: tier.placements.map(pl => ({
                                name: pl.name, x: pl.x, y: pl.y, w: pl.w, l: pl.l, h: pl.h, weight: pl.weight
                            })),
                            contents
                        });

                        contents.forEach(c => {
                            const existing = compData.items.find(i =>
                                i.name === c.name && i.l === c.l && i.w === c.w && i.h === c.h);
                            if (existing) existing.count += c.count;
                            else compData.items.push({ name: c.name, count: c.count, l: c.l, w: c.w, h: c.h, weight: c.weight });
                        });

                        compData.height_used += tier.height;
                        compData.weight += tier.placedWeight;
                        holdRes.current_weight += tier.placedWeight;
                        currentTotalGross += tier.placedWeight;
                        compData.volume += tier.placedVolume;
                    }
                }
            }
        };

        // PASS 1 — items that can only ride on the main deck (too big for the
        // hatch, or flagged Main Deck Only).
        packToPallets(mustMainItems);

        // PASS 2 — items explicitly flagged Lower Deck Only.
        packToLowerDeck(mustLowerItems);

        // PASS 3 — fill the belly with the small, light cargo it exists for.
        // The belly is loaded BEFORE the main deck: its volume is unusable by
        // anything else, while every box left on a pallet costs main-deck stack
        // height. Biggest eligible boxes go first so the holds fill densely.
        const bellyCandidates = flexibleItems
            .filter(i => i.count > 0 && bellyEligible(i))
            .sort((a, b) => b.volumeM3 - a.volumeM3);
        packToLowerDeck(bellyCandidates);

        // PASS 4 — everything still outstanding goes onto the pallets.
        packToPallets(flexibleItems);

        // PASS 5 — anything the main deck could not take, retry in the belly
        // (weight caps on a pallet may have blocked it earlier).
        packToLowerDeck(flexibleItems);

        return { pallets, lowerDeck: lowerDeckResults, leftovers: workingItems.filter(i => i.count > 0), aircraftId, maxGrossLimit };
    },

    /**
     * Calculates the total number of flights required to transport ALL cargo items.
     * Simulates repeated packing passes (one per flight) until no cargo remains.
     *
     * @param {string} configCode  - Pallet config: "PAG" or "PMC"
     * @param {Array}  cargoItems  - Original full cargo list (not mutated)
     * @param {Object} options     - Same options as packAircraft
     * @returns {Object} { totalFlights, flightBreakdown }
     *   flightBreakdown: Array of { flightNum, loaded, leftovers } per flight
     */
    calculateTotalFlights: (configCode, cargoItems, options = {}) => {
        // Deep-clone the cargo so we don't mutate the caller's list
        let remaining = cargoItems
            .filter(i => i.count > 0)
            .map(i => ({ ...i, count: i.count }));

        const flightBreakdown = [];
        let flightNum = 0;
        const MAX_FLIGHTS = 100; // Safety cap — prevent infinite loops

        while (remaining.some(i => i.count > 0) && flightNum < MAX_FLIGHTS) {
            flightNum++;

            // Run a full pack simulation for this flight
            const result = Packer.packAircraft(configCode, remaining, options);

            // Count how many were loaded this flight
            const mdLoaded = result.pallets.reduce(
                (acc, p) => acc + p.layers.reduce((la, l) => la + l.count, 0), 0
            );
            const ldLoaded = result.lowerDeck.reduce(
                (acc, h) => acc + h.compartments.reduce(
                    (ca, c) => ca + c.items.reduce((ia, i) => ia + i.count, 0), 0
                ), 0
            );
            const totalLoaded = mdLoaded + ldLoaded;

            const leftoverCount = result.leftovers.reduce((acc, i) => acc + i.count, 0);

            flightBreakdown.push({
                flightNum,
                loaded: totalLoaded,
                mdLoaded,
                ldLoaded,
                leftoverCount,
                leftovers: result.leftovers.map(i => ({ name: i.name, count: i.count }))
            });

            // Nothing could be loaded — the rest is physically un-loadable. Drop this
            // empty flight from the count; an aircraft that carries nothing is not
            // a flight, and reporting one made the total misleading.
            if (totalLoaded === 0) {
                flightBreakdown.pop();
                flightNum--;
                break;
            }

            // Advance remaining = only the leftovers after this flight
            remaining = result.leftovers
                .filter(i => i.count > 0)
                .map(i => ({ ...i, count: i.count }));
        }

        return {
            totalFlights: flightNum,
            flightBreakdown,
            allCleared: remaining.every(i => i.count === 0)
        };
    }
};

// export { Packer, CONFIG };
if (typeof module !== 'undefined') {
    module.exports = { Packer, CONFIG, LOWER_DECK_MAX_BOX_KG };
}
