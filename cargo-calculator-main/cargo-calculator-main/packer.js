/**
 * SkyGuard Cargo Packer Logic
 * Ported from cargo_calculator.py
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
            max_height: 208,
            tare_weight: 120,
            contour_start_height: 114.3,
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
            max_weight: 9379,
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
                    max_weight: 5606, max_volume: 30.7,
                    max_length_cm: 608, max_height_cm: 112,
                    obstacles: [{ l: 238, w: 72, h: 134, name: "Structural Block" }]
                }
            ]
        }
    ]
};

class CargoItem {
    constructor(id, name, length, width, height, weight, count, allowTipping = false, noStack = false) {
        this.id = id;
        this.name = name;
        this.dims = [length, width, height].sort((a, b) => a - b);
        this.originalDims = [length, width, height];
        this.weight = weight;
        this.count = count;
        this.count = count;
        this.allowTipping = allowTipping;
        if (noStack) {
            this.allowTipping = false; // Forced
            this.noStack = true;
        } else {
            this.noStack = false;
        }
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
    }

    getFuselageWidth(heightCm) {
        const c = this.config;
        let fuselageW = 0;
        if (heightCm <= c.contour_start_height) fuselageW = c.width_fuselage_start;
        else if (heightCm <= c.contour_mid_height) {
            let ratio = (heightCm - c.contour_start_height) / (c.contour_mid_height - c.contour_start_height);
            fuselageW = c.width_fuselage_start + ratio * (c.width_mid_taper - c.width_fuselage_start);
        } else if (heightCm <= CONFIG.MAX_FUSELAGE_HEIGHT_CM) {
            let ratio = (heightCm - c.contour_mid_height) / (CONFIG.MAX_FUSELAGE_HEIGHT_CM - c.contour_mid_height);
            fuselageW = c.width_mid_taper + ratio * (c.width_top - c.width_mid_taper);
        }
        let base = Math.min(c.width_base, fuselageW);
        // Tail Constraints: Narrower fuselage at the last position
        if (c.code === "PAG" && this.id === 15) base *= 0.85; // 15% reduction
        else if (c.code === "PMC" && this.id === 13) base *= 0.85; // 15% reduction
        return base;
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
            // Pack A: dimCross=l, dimLong=w. Pack B: dimCross=w, dimLong=l
            dim_cross: best.type === 'A' ? variant.l : variant.w,
            dim_long: best.type === 'A' ? variant.w : variant.l
        };
    },

    packAircraft: (configCode, cargoItems) => {
        const config = CONFIG.PALLET_OPTIONS[configCode];

        // --- PRE-PROCESS: SORT BY PRIORITY THEN FUSELAGE OPTIMIZATION ---
        // 1. Map to CargoItem objects
        // 2. Sort: High Priority (true) > Normal Priority (false)
        // 3. Within same priority: No-Stack items last, then by volume descending
        let workingItems = cargoItems.map(i => {
            const item = new CargoItem(i.id, i.name, i.length, i.width, i.height, i.weight, i.count, i.allowTipping, i.noStack);
            item.priority = i.priority || false;
            return item;
        });

        workingItems.sort((a, b) => {
            // Priority first (true comes before false)
            if (a.priority !== b.priority) return a.priority ? -1 : 1;

            // Then No-Stack (lids) last
            if (a.noStack !== b.noStack) return a.noStack ? 1 : -1;

            // Then volume descending for better packing
            return b.volumeM3 - a.volumeM3;
        });

        // --- STEP 1: PACK MAIN DECK PALLETS ---
        let pallets = [];
        for (let i = 1; i <= config.count; i++) {
            let p = new Pallet(i, config);
            while (true) {
                if (workingItems.every(x => x.count === 0)) break;
                let bestLayer = null;
                let itemToTake = null;

                for (let item of workingItems) {
                    if (item.count <= 0) continue;
                    if (!Packer.fitsThroughDoor(item, CONFIG.DOOR_MAIN)) {
                        continue;
                    }
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
                p.currentHeight += bestLayer.height;
                itemToTake.count -= toTake;

                if (itemToTake.noStack) {
                    // Close the pallet. This layer is the top layer.
                    // We artificially set height to max to prevent further packing
                    p.currentHeight = p.config.max_height;
                }
            }
            pallets.push(p);
        }

        // --- STEP 2: PACK LOWER DECK SECOND ---
        let lowerDeckResults = [];
        for (let hold of CONFIG.LOWER_DECK) {
            let holdRes = { name: hold.name, current_weight: 0, compartments: [] };
            for (let comp of hold.compartments) {
                let cData = { id: comp.id, name: comp.name, items: [], weight: 0, volume: 0, max_weight: comp.max_weight, max_volume: comp.max_volume };
                for (let item of workingItems) {
                    if (item.count <= 0) continue;

                    // Specific check for lower deck doors
                    let [i_min, i_mid] = item.dims;
                    let d_min = Math.min(hold.door.width, hold.door.height);
                    let d_max = Math.max(hold.door.width, hold.door.height);
                    if (!(i_min <= d_min && i_mid <= d_max)) {
                        continue;
                    }

                    // Simplified Geo Fit for Lower Deck
                    let itemLen, itemHeight;

                    if (item.allowTipping) {
                        // Use the item's largest two dimensions for floor footprint if L/W, or H if tipped
                        itemLen = item.dims[1];
                        itemHeight = item.dims[0];
                        if (item.dims[2] <= comp.max_height_cm) {
                            itemHeight = item.dims[2];
                            itemLen = item.dims[1];
                        }
                    } else {
                        // Strict orientation (Height is Fixed)
                        itemHeight = item.originalDims[2];
                        let floorDims = [item.originalDims[0], item.originalDims[1]].sort((a, b) => a - b);
                        // We can rotate on floor freely
                        itemLen = floorDims[1];
                    }

                    if (itemHeight > comp.max_height_cm) {
                        continue;
                    }

                    let maxGeo = Math.floor(comp.max_length_cm / itemLen) * Math.floor(comp.max_height_cm / itemHeight);
                    // Assume hold width allows at least 2 rows if small
                    let rows = Math.floor(hold.floor_width_cm / (item.allowTipping ? item.dims[0] : Math.min(item.originalDims[0], item.originalDims[1])));
                    if (rows < 1) rows = 1;
                    maxGeo *= rows;

                    if (comp.obstacles) {
                        for (let obs of comp.obstacles) {
                            if (itemHeight > (comp.max_height_cm - obs.h)) {
                                let capFull = Math.floor(comp.max_length_cm / itemLen);
                                let capRed = Math.floor((comp.max_length_cm - obs.l) / itemLen);
                                maxGeo -= (capFull - capRed) * rows;
                            }
                        }
                    }

                    let currentInComp = 0;
                    while (item.count > 0 && currentInComp < maxGeo) {
                        if (cData.weight + item.weight > comp.max_weight) break;
                        if (cData.volume + item.volumeM3 > comp.max_volume) break;
                        if (holdRes.current_weight + cData.weight + item.weight > hold.max_weight) break;

                        let toTake = Math.min(item.count, maxGeo - currentInComp);
                        let wTake = Math.floor((comp.max_weight - cData.weight) / item.weight);
                        toTake = Math.min(toTake, wTake);

                        if (toTake <= 0) break;

                        let existing = cData.items.find(i => i.name === item.name);
                        if (existing) existing.count += toTake;
                        else {
                            // Determine dims used for packing
                            let widthOnFloor = item.dims.find(d => d !== itemLen && d !== itemHeight);
                            // If duplicates exist, this might fail logic, but simplified:
                            if (widthOnFloor === undefined) widthOnFloor = item.dims[0]; // Fallback

                            cData.items.push({
                                name: item.name,
                                count: toTake,
                                l: itemLen,
                                h: itemHeight,
                                w: widthOnFloor
                            });
                        }

                        cData.weight += toTake * item.weight;
                        cData.volume += toTake * item.volumeM3;
                        item.count -= toTake;
                        currentInComp += toTake;
                    }
                }
                holdRes.current_weight += cData.weight;
                holdRes.compartments.push(cData);
            }
            lowerDeckResults.push(holdRes);
        }

        return { pallets, lowerDeck: lowerDeckResults, leftovers: workingItems.filter(i => i.count > 0) };
    }
};

export { Packer, CONFIG };
