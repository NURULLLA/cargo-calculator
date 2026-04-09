/**
 * SkyGuard Cargo Packer Logic
 * Ported from cargo_calculator.py - High Fidelity Version
 */

// Weight (kg) of the permanently installed technical kit in the AFT lower deck (C4):
// Spare nose wheel (1), spare main wheel (1), and jack (1) — by airline management decision.
// This applies to BOTH aircraft (UK75057 and UK75058).
const TECH_KIT_WEIGHT_KG = 300;

const CONFIG = {
    AIRCRAFT_NAME: "Boeing 757-200 PCF",
    MAX_FUSELAGE_HEIGHT_CM: 208,
    DOOR_MAIN: { width: 340, height: 218 },
    DOOR_FWD_BELLY: { width: 140, height: 108 },
    DOOR_AFT_BELLY: { width: 140, height: 112 },

    PALLET_OPTIONS: {
        PAG: {
            code: "PAG",
            name: "PAG (High) - 15 positions",
            count: 15,
            length_cross: 301,  // real measured usable cm
            width_long: 207,    // real measured usable cm
            max_height: 208,
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
            width_long: 227,    // real measured usable cm
            max_height: 208,
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

function getFuselageWidthFromProfile(heightCm, zone) {
    const profile = FUSELAGE_PROFILES[zone] || FUSELAGE_PROFILES.MIDDLE;
    const sorted = [...profile].sort((a, b) => a[0] - b[0]);
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

        function tryOrientation(dimCross, dimLong) {
            // cols = how many boxes fit across the fuselage width (cross direction)
            // rows = how many boxes fit along the pallet length (long direction)
            let cols = Math.floor(availCross / dimCross);
            let rows = Math.floor(availLong / dimLong);
            if (cols < 1 || rows < 1) return { total: 0, meta: { main: { r: 0, c: 0 }, side: null } };
            let countMain = cols * rows;
            let remCross = availCross - (cols * dimCross);
            let sideMeta = null;
            // Side-block: rotate remaining cross-space, only if at least 1 col and 1 row fit
            if (remCross >= dimLong && availLong >= dimCross) {
                let sCols = Math.floor(remCross / dimLong);
                let sRows = Math.floor(availLong / dimCross);
                if (sCols >= 1 && sRows >= 1) {
                    sideMeta = { r: sRows, c: sCols, count: sCols * sRows };
                }
            }
            return { total: countMain + (sideMeta ? sideMeta.count : 0), meta: { main: { r: rows, c: cols }, side: sideMeta } };
        }

        let a = tryOrientation(variant.l, variant.w);
        let b = tryOrientation(variant.w, variant.l);
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
        // NOTE: lowerDeckOnly items that don't fit the door are excluded from mustMain —
        // they are physically impossible to load and will appear as leftovers.
        const mustMainItems = workingItems.filter(i => !i.lowerDeckOnly && (i.mainDeckOnly || !fitsInAnyLowerDoor(i)));
        const flexibleItems = workingItems.filter(i => !i.mainDeckOnly && !i.lowerDeckOnly && fitsInAnyLowerDoor(i));
        const mustLowerItems = workingItems.filter(i => i.lowerDeckOnly && fitsInAnyLowerDoor(i));
        // lowerDeckOnly items that don't fit ANY lower deck door → stay in workingItems untouched → become leftovers

        // Sorting for Main Deck: Big volume first
        const sortForMain = (items) => items.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority ? -1 : 1;
            return b.volumeM3 - a.volumeM3;
        });

        // --- PASS 1: PACK MUST-MAIN ON MAIN DECK ---
        let pallets = [];
        for (let i = 1; i <= config.count; i++) {
            pallets.push(new Pallet(i, config));
        }

        const packToPallets = (targetItems) => {
            sortForMain(targetItems);
            for (let p of pallets) {
                while (true) {
                    if (targetItems.every(x => x.count === 0)) break;
                    if (currentTotalGross >= maxGrossLimit) break;

                    let bestLayer = null;
                    let itemToTake = null;
                    
                    for (let item of targetItems) {
                        if (item.count <= 0) continue;
                        if (!Packer.fitsThroughDoor(item, CONFIG.DOOR_MAIN)) continue;
                        if (p.remainingWeight() < item.weight) continue;
                        if (currentTotalGross + item.weight > maxGrossLimit) continue;
                        
                        let bestVariantLayer = null;
                        for (let variant of item.getVariants()) {
                            let res = Packer.calculateLayer(p, variant);
                            if (res) {
                                if (!bestVariantLayer || res.count > bestVariantLayer.count) {
                                    bestVariantLayer = res;
                                }
                            }
                        }
                        
                        if (bestVariantLayer) {
                            bestLayer = bestVariantLayer;
                            itemToTake = item;
                            break; // Priority to largest items: pick first item that found a valid layer
                        }
                    }
                    if (!bestLayer) break;

                    let toTake = Math.min(bestLayer.count, itemToTake.count);
                    if (p.remainingWeight() < toTake * bestLayer.weight) {
                        toTake = Math.floor(p.remainingWeight() / itemToTake.weight);
                    }
                    if (currentTotalGross + (toTake * bestLayer.weight) > maxGrossLimit) {
                        toTake = Math.floor((maxGrossLimit - currentTotalGross) / bestLayer.weight);
                    }

                    if (toTake <= 0) break;

                    p.layers.push({
                        box_name: bestLayer.name,
                        count: toTake,
                        height: bestLayer.height,
                        z_start: p.currentHeight,
                        z_end: p.currentHeight + bestLayer.height,
                        meta: bestLayer.meta,
                        orient_type: bestLayer.orientType,
                        dim_cross: bestLayer.dim_cross,
                        dim_long: bestLayer.dim_long
                    });
                    p.currentWeight += toTake * bestLayer.weight;
                    currentTotalGross += toTake * bestLayer.weight;
                    p.currentHeight += bestLayer.height;
                    itemToTake.count -= toTake;

                    if (itemToTake.noStack) p.currentHeight = p.config.max_height;
                }
            }
        };

        let lowerDeckResults = [];
        const packToLowerDeck = (targetItems) => {
            if (mainDeckOnlyGlobal) return;
            for (let hold of CONFIG.LOWER_DECK) {
                let holdRes = lowerDeckResults.find(h => h.name === hold.name);
                if (!holdRes) {
                    holdRes = { name: hold.name, current_weight: 0, compartments: [] };
                    hold.compartments.forEach(comp => {
                        holdRes.compartments.push({ id: comp.id, name: comp.name, items: [], weight: 0, volume: 0, max_weight: comp.max_weight, max_volume: comp.max_volume, geo_used_ratio: 0 });
                    });
                    lowerDeckResults.push(holdRes);
                }

                for (let compData of holdRes.compartments) {
                    const compSpec = hold.compartments.find(c => c.id === compData.id);
                    for (let item of targetItems) {
                        if (item.count <= 0) continue;
                        if (currentTotalGross >= maxGrossLimit) break;

                        // BUG FIX: Also enforce hold-level total weight cap
                        if (holdRes.current_weight >= hold.max_weight) break;

                        let [i_min, i_mid] = item.dims;
                        let d_min = Math.min(hold.door.width, hold.door.height);
                        let d_max = Math.max(hold.door.width, hold.door.height);
                        if (!(i_min <= d_min && i_mid <= d_max)) continue;

                        // LOWER DECK WEIGHT LIMIT: Ground crew cannot manually lift > 75 kg per box
                        if (item.weight > 75) continue;

                        let bestCompFit = null;
                        for (let variant of item.getVariants()) {
                            let itemHeight = variant.h;
                            if (itemHeight > compSpec.max_height_cm) continue;
                            
                            let orientations = [
                                { l: variant.l, w: variant.w },
                                { l: variant.w, w: variant.l }
                            ];
                            
                            for (let ori of orientations) {
                                let rows = Math.floor(hold.floor_width_cm / ori.w);
                                if (rows < 1) continue; // MUST FIT strictly inside floor width
                                
                                let maxLayers = Math.floor(compSpec.max_height_cm / itemHeight);
                                let maxCols = Math.floor(compSpec.max_length_cm / ori.l);
                                let maxGeo = maxCols * rows * maxLayers;
                                
                                if (maxGeo > 0) {
                                    if (!bestCompFit || maxGeo > bestCompFit.maxGeo) {
                                        bestCompFit = { maxGeo, h: itemHeight, l: ori.l, w: ori.w };
                                    }
                                }
                            }
                        }
                        
                        if (!bestCompFit) continue;

                        let maxGeo = bestCompFit.maxGeo;
                        let item_geo_ratio = 1.0 / maxGeo;
                        // BUG FIX: Clamp geo_used_ratio to [0, 1] before computing remaining space
                        let safeGeoUsed = Math.min(compData.geo_used_ratio, 1.0);
                        let remainingGeo = Math.max(0, Math.floor(maxGeo * (1.0 - safeGeoUsed)));

                        let toTake = Math.min(item.count, remainingGeo);
                        let wTake = Math.floor((compSpec.max_weight - compData.weight) / item.weight);
                        toTake = Math.min(toTake, wTake);
                        // BUG FIX: Also cap by hold-level remaining weight capacity
                        let holdTake = Math.floor((hold.max_weight - holdRes.current_weight) / item.weight);
                        toTake = Math.min(toTake, holdTake);
                        let aircraftTake = Math.floor((maxGrossLimit - currentTotalGross) / item.weight);
                        toTake = Math.min(toTake, aircraftTake);

                        if (toTake > 0) {
                            let existing = compData.items.find(i => i.name === item.name);
                            if (existing) existing.count += toTake;
                            else compData.items.push({ name: item.name, count: toTake, l: bestCompFit.l, h: bestCompFit.h, w: bestCompFit.w, weight: item.weight });
                            
                            compData.weight += toTake * item.weight;
                            holdRes.current_weight += toTake * item.weight;
                            currentTotalGross += toTake * item.weight;
                            compData.volume += toTake * item.volumeM3;
                            compData.geo_used_ratio += toTake * item_geo_ratio;
                            item.count -= toTake;
                        }
                    }
                }
            }
        };

        // First pass: Fill pallets with MUST-MAIN items
        packToPallets(mustMainItems);

        // Second pass: Fill pallets with FLEXIBLE items (Main Deck is priority!)
        packToPallets(flexibleItems);

        // Third pass: Pack MUST-LOWER items into Lower Deck
        packToLowerDeck(mustLowerItems);

        // Fourth pass: Pack remaining FLEXIBLE items into Lower Deck
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

            // If nothing was loaded this flight, we're stuck — break to avoid infinite loop
            if (totalLoaded === 0) break;

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
    module.exports = { Packer, CONFIG };
}
