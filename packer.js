/**
 * SkyGuard Cargo Packer Logic
 * Ported from cargo_calculator.py - High Fidelity Version
 */

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
            length_cross: 303,
            width_long: 209,
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
            length_cross: 303,
            width_long: 229,
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
                    max_weight: 5306, max_volume: 30.7,
                    max_length_cm: 608, max_height_cm: 112,
                    obstacles: [{ l: 238, w: 72, h: 134, name: "Structural Block" }]
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
    fitsThroughDoor: (item, door) => {
        let [i_min, i_mid] = item.dims;
        let d_min = Math.min(door.width, door.height);
        let d_max = Math.max(door.width, door.height);
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
            let cols = Math.floor(availCross / dimCross);
            let rows = Math.floor(availLong / dimLong);
            let countMain = cols * rows;
            let remCross = availCross - (cols * dimCross);
            let sideMeta = null;
            if (remCross >= dimLong && availLong >= dimCross) {
                let sCols = Math.floor(remCross / dimLong);
                let sRows = Math.floor(availLong / dimCross);
                sideMeta = { r: sCols, c: sRows, count: sCols * sRows };
            }
            return { total: countMain + (sideMeta ? sideMeta.count : 0), meta: { main: { r: cols, c: rows }, side: sideMeta } };
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

        // Classification helper
        const fitsInAnyLowerDoor = (item) => {
            return CONFIG.LOWER_DECK.some(hold => {
                let [i_min, i_mid] = item.dims;
                let d_min = Math.min(hold.door.width, hold.door.height);
                let d_max = Math.max(hold.door.width, hold.door.height);
                return i_min <= d_min && i_mid <= d_max;
            });
        };

        // Split items based on where they CAN and SHOULD go
        const mustMainItems = workingItems.filter(i => i.mainDeckOnly || !fitsInAnyLowerDoor(i));
        const flexibleItems = workingItems.filter(i => !i.mainDeckOnly && !i.lowerDeckOnly && fitsInAnyLowerDoor(i));
        const mustLowerItems = workingItems.filter(i => i.lowerDeckOnly && fitsInAnyLowerDoor(i));

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
                        
                        for (let variant of item.getVariants()) {
                            let res = Packer.calculateLayer(p, variant);
                            if (res && (!bestLayer || res.count > bestLayer.count)) {
                                bestLayer = res;
                                itemToTake = item;
                            }
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

        // First pass: Fill pallets with large items
        packToPallets(mustMainItems);

        // --- PASS 2: PACK MUST-LOWER AND FLEXIBLE INTO LOWER DECK ---
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

                        let [i_min, i_mid] = item.dims;
                        let d_min = Math.min(hold.door.width, hold.door.height);
                        let d_max = Math.max(hold.door.width, hold.door.height);
                        if (!(i_min <= d_min && i_mid <= d_max)) continue;

                        let itemHeight = item.allowTipping ? item.dims[0] : item.originalDims[2];
                        let itemLen = item.dims[1]; 
                        if (itemHeight > compSpec.max_height_cm) continue;

                        let rows = Math.floor(hold.floor_width_cm / (item.allowTipping ? item.dims[0] : Math.min(item.originalDims[0], item.originalDims[1])));
                        if (rows < 1) rows = 1;
                        let maxGeo = Math.floor(compSpec.max_length_cm / itemLen) * rows * Math.floor(compSpec.max_height_cm / itemHeight);
                        if (maxGeo <= 0) continue;
                        
                        let item_geo_ratio = 1.0 / maxGeo;
                        let remainingGeo = Math.floor(maxGeo * (1.0 - compData.geo_used_ratio));

                        let toTake = Math.min(item.count, remainingGeo);
                        let wTake = Math.floor((compSpec.max_weight - compData.weight) / item.weight);
                        toTake = Math.min(toTake, wTake);
                        let aircraftTake = Math.floor((maxGrossLimit - currentTotalGross) / item.weight);
                        toTake = Math.min(toTake, aircraftTake);

                        if (toTake > 0) {
                            let existing = compData.items.find(i => i.name === item.name);
                            if (existing) existing.count += toTake;
                            else compData.items.push({ name: item.name, count: toTake, l: itemLen, h: itemHeight, w: item.dims[0] });
                            
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

        // Pack small items into holds
        packToLowerDeck([...mustLowerItems, ...flexibleItems]);

        // --- PASS 3: PACK REMAINING FLEXIBLE ITEMS ONTO MAIN DECK PALLETS ---
        packToPallets(flexibleItems);

        // --- PASS 4: FINAL CLEANUP (Try everything against Lower Deck again) ---
        packToLowerDeck(flexibleItems);
        packToLowerDeck(mustMainItems); // Just in case a large item fits door but was skipped

        return { pallets, lowerDeck: lowerDeckResults, leftovers: workingItems.filter(i => i.count > 0), aircraftId, maxGrossLimit };
    }
};

// export { Packer, CONFIG };
if (typeof module !== 'undefined') {
    module.exports = { Packer, CONFIG };
}
