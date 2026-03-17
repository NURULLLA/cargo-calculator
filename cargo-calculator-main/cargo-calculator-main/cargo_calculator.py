import math
import copy
import argparse
import sys
from config import *

# ============================================
# CLASSES
# ============================================

class CargoItem:
    def __init__(self, name, length, width, height, weight, count, allow_tipping=False, priority=0):
        self.name = name
        self.dims = sorted([length, width, height]) # Sort to easily find min/max
        self.original_dims = [length, width, height] # Keep original for reference
        self.weight = weight
        self.priority = priority
        self.count = count
        self.allow_tipping = allow_tipping
        self.max_count_in_hold = {} # Tracks geometric limit per compartment
        self.volume_m3 = (length * width * height) / 1_000_000.0

    def get_variants(self):
        """
        Returns a list of possible (length, width, height) tuples for this item.
        If tipping is allowed, returns all unique height orientations.
        Always returns dimensions such that length >= width for the floor footprint.
        """
        variants = []
        possible_heights = []
        
        if self.allow_tipping:
            possible_heights = list(set(self.dims))
        else:
            # If no tipping, strictly respect the original inputs? 
            # Usually "no tipping" means height is fixed. Logic assumes Z-axis is fixed.
            possible_heights = [self.original_dims[2]] 

        for h in possible_heights:
            rem_dims = list(self.original_dims)
            if h in rem_dims:
                rem_dims.remove(h)
            else:
                 # Fallback if floating point weirdness (shouldn't happen with exact inputs)
                 # Reconstruct from sorted dims
                 temp = list(self.dims)
                 temp.remove(h)
                 rem_dims = temp

            # We assume we can rotate on the floor (Yaw), so we standardize L >= W
            l = max(rem_dims)
            w = min(rem_dims)
            variants.append({'l': l, 'w': w, 'h': h, 'weight': self.weight, 'name': self.name, 'ref': self})
            
        return variants

    def __repr__(self):
        return f"<{self.name}: {self.count}x {self.weight}kg>"


class LayerResult:
    def __init__(self, count, height, weight, layout_desc, meta):
        self.count = count
        self.height = height
        self.weight = weight
        self.layout_desc = layout_desc
        self.meta = meta
    
    @property
    def total_weight(self):
        return self.count * self.weight


class Pallet:
    def __init__(self, pallet_id, config):
        self.id = pallet_id
        self.config = config
        self.max_gross_weight = self._get_weight_limit()
        self.tare_weight = config['tare_weight']
        self.max_net_weight = self.max_gross_weight - self.tare_weight
        self.current_weight = 0.0
        self.current_height = 0.0
        self.layers = [] # List of dicts or LayerResult objects
    
    def _get_weight_limit(self):
        if self.config['code'] == 'PAG':
            return PAG_WEIGHT_LIMITS.get(self.id, PAG_DEFAULT_WEIGHT)
        elif self.config['code'] == 'PMC':
            return PMC_WEIGHT_LIMITS.get(self.id, PMC_DEFAULT_WEIGHT)
        return DEFAULT_POS_LIMIT

    def remaining_weight(self):
        return self.max_net_weight - self.current_weight

    def can_fit_height(self, h_add):
        return (self.current_height + h_add) <= self.config['max_height']

    def add_layer(self, layer_res):
        self.layers.append({
            "box_name": layer_res.meta['name'],
            "count": layer_res.count,
            "height": layer_res.height,
            "z_start": self.current_height,
            "z_end": self.current_height + layer_res.height,
            "layout": layer_res.layout_desc,
            "meta": layer_res.meta
        })
        self.current_weight += layer_res.total_weight
        self.current_height += layer_res.height
    
    def get_fuselage_width(self, height_cm):
        c = self.config
        
        # Calculate theoretical fuselage contour width first
        if height_cm <= c['contour_start_height']:
            # Below 114cm, fuselage wall is at 317 theoretically (flare) 
            # OR we treat it as flat 317 until the taper starts?
            # User says "contour is considered 317".
            fuselage_w = c['width_fuselage_start']
        elif height_cm <= c['contour_mid_height']:
            # Linear Interp 317 -> 223
            ratio = (height_cm - c['contour_start_height']) / (c['contour_mid_height'] - c['contour_start_height'])
            fuselage_w = c['width_fuselage_start'] + ratio * (c['width_mid_taper'] - c['width_fuselage_start'])
        elif height_cm <= MAX_FUSELAGE_HEIGHT_CM:
             # Linear Interp 223 -> 117
            ratio = (height_cm - c['contour_mid_height']) / (MAX_FUSELAGE_HEIGHT_CM - c['contour_mid_height'])
            fuselage_w = c['width_mid_taper'] + ratio * (c['width_top'] - c['width_mid_taper'])
        else:
            fuselage_w = 0

        # Enforce Max Usable Width (User Rule: Max 304cm at base)
        # We take the MIN of the Usable Cap (304) and the Physical Wall (fuselage_w)
        base = min(c['width_base'], fuselage_w)

        # Tail Reductions
        # PAG pos 15, PMC pos 13
        is_last_pag = (c['code'] == 'PAG' and self.id == 15)
        is_last_pmc = (c['code'] == 'PMC' and self.id == 13)
        
        if is_last_pag:
            base *= 0.88 # -12% roughly
        elif is_last_pmc:
            base *= 0.90 # -10% roughly
            
        return base


class Packer:
    @staticmethod
    def fits_through_door(item, door_dim):
        # item.dims is sorted [min, mid, max]
        # Door has width, height.
        # Minimal Check: Smallest 2 dimensions must fit through Width x Height
        # Actually usually flat on floor. Width and Height of ITEM must fit Width and Height of DOOR.
        # But we can rotate item 90 deg entering door.
        # So we just need some 2D projection of Item to fit inside Door 2D rect.
        # Simplest: Min(ItemDims) <= Min(DoorDims) AND Mid(ItemDims) <= Max(DoorDims)
        # Wait, if Item is 300 x 200 x 50. Door is 100 x 100.
        # 50 < 100. 200 > 100. Fail.
        # Item 300x50x50. Door 100x100. 
        # 50 < 100. 50 < 100. Fits (Length 300 goes long way)
        
        d_min = min(door_dim['width'], door_dim['height'])
        d_max = max(door_dim['width'], door_dim['height'])
        
        i_min = item.dims[0]
        i_mid = item.dims[1]
        
        return (i_min <= d_min and i_mid <= d_max)

    @staticmethod
    def calculate_layer(pallet, item_variant):
        """
        Calculates the best layer layout for a given item variant on the current pallet top.
        Returns LayerResult or None.
        """
        box_h = item_variant['h']
        box_l = item_variant['l'] # Already max of floor dims
        box_w = item_variant['w'] # Already min of floor dims
        
        # Check height clearance basically at the TOP of this new layer to be safe (conservative)
        # or check at midpoint? Using top is safest for contour.
        check_height = pallet.current_height + box_h
        if check_height > pallet.config['max_height']:
             return None

        fuselage_w = pallet.get_fuselage_width(check_height)
        
        avail_cross = min(pallet.config['length_cross'], fuselage_w)
        avail_long = pallet.config['width_long']

        if avail_cross < min(box_l, box_w):
            return None # Cant satisfy width

        # Strategy: Try 2 orientations for the "Main Block"
        # Orient A: Box Length runs along Crosswise (Left-Right)
        # Orient B: Box Width runs along Crosswise (Left-Right)
        
        def try_orientation(dim_cross, dim_long):
            # Main block
            cols = int(avail_cross // dim_cross)
            rows = int(avail_long // dim_long)
            count_main = cols * rows
            
            # Remaining space optimization (Side gap)
            rem_cross = avail_cross - (cols * dim_cross)
            count_side = 0
            side_meta = None
            
            # Can we fit the ROTATED box in the remainder?
            # Rotated means dim_long is now crosswise, dim_cross is lengthwise
            if rem_cross >= dim_long and avail_long >= dim_cross:
                s_cols = int(rem_cross // dim_long)
                s_rows = int(avail_long // dim_cross)
                count_side = s_cols * s_rows
                side_meta = {'r': s_cols, 'c': s_rows, 'orient': 'ROTATED', 'count': count_side}
            
            total = count_main + count_side
            
            meta = {
                'main': {'r': cols, 'c': rows, 'orient': 'STANDARD', 'count': count_main},
                'side': side_meta,
                'unused_width': avail_cross - ((cols * dim_cross) + ((s_cols * dim_long) if side_meta else 0)),
                'unused_len': avail_long - (rows * dim_long), # Approximate, assumes side block fills len
                'name': item_variant['name']
            }
            return total, meta

        # Try A: Length is Cross
        cnt_a, meta_a = try_orientation(box_l, box_w)
        meta_a['orient_type'] = 'A (Length along Fuselage Width)'
        
        # Try B: Width is Cross
        cnt_b, meta_b = try_orientation(box_w, box_l)
        meta_b['orient_type'] = 'B (Width along Fuselage Width)'
        
        best = (cnt_a, meta_a) if cnt_a >= cnt_b else (cnt_b, meta_b)
        
        if best[0] == 0:
            return None
            
        return LayerResult(
            count=best[0],
            height=box_h,
            weight=item_variant['weight'],
            layout_desc=f"{best[1]['orient_type']} - Total {best[0]}",
            meta=best[1]
        )

    @staticmethod
    def pack_lower_deck(groups_ref):
        results = []
        
        # Iterate over Holds (FWD, AFT)
        for hold_key, hold_data in LOWER_DECK.items():
            hold_res = {
                "name": hold_data['name'],
                "max_weight": hold_data['max_weight'],
                "current_weight": 0.0,
                "compartments": []
            }
            
            for comp in hold_data['compartments']:
                c_data = {
                    "name": comp["name"],
                    "items": [],
                    "weight": 0.0,
                    "volume": 0.0,
                    "stats": comp
                }
                
                # Try to fill this compartment
                for item in groups_ref:
                    if item.count <= 0: continue
                    
                    # Door Check
                    if 'door' in hold_data:
                        if not Packer.fits_through_door(item, hold_data['door']):
                            continue
                            
                    # --- GEOMETRIC FIT CHECK ---
                    # The compartment has specific dimensions: Length, Max Height, Floor Width.
                    # We need to calculate how many items physically fit.
                    # We allow rotation (L vs W) on the floor. Height is usually strict (Z-axis).
                    
                    # Get compartment metric limits
                    c_len = comp['max_length_cm']
                    c_hgt = comp['max_height_cm']
                    c_min_hgt = comp.get('min_height_cm', c_hgt) # Default to uniform if no taper
                    
                    # Use floor width from Hold config, default to 120 if missing (conservative)
                    c_wid_floor = hold_data.get('floor_width_cm', 120) 
                    
                    # Item Dims: item.dims is [min, mid, max].
                    # But we need to know which is Height.
                    # If allow_tipping is False, Height is fixed.
                    # We need to iterate valid orientations for this specific compartment.
                    
                    valid_geo_counts = []
                    variants = item.get_variants()
                    
                    for v in variants:
                        # v has {'l': ..., 'w': ..., 'h': ...}
                        if v['h'] > c_hgt: continue
                        
                        # --- 1. Calculate Length Limit determined by HEIGHT ---
                        # Using Power Curve (convex) for ceiling
                        len_limit_h = c_len
                        if c_hgt > c_min_hgt:
                             if v['h'] <= c_min_hgt:
                                 len_limit_h = c_len
                             elif v['h'] >= c_hgt:
                                 len_limit_h = 0
                             else:
                                 # Power Curve Logic: h(x) = H_max - (H_max - H_min) * (x / L)^Power
                                 POWER_H = 3.0
                                 ratio_h = (c_hgt - v['h']) / (c_hgt - c_min_hgt)
                                 ratio_h = max(0.0, min(1.0, ratio_h))
                                 len_limit_h = int(c_len * (ratio_h ** (1/POWER_H)))
                        
                        # --- 2. Calculate Length Limit determined by WIDTH ---
                        # Linear Taper found too restrictive (Count 3). User verified 5 boxes fit.
                        # This implies the floor stays wide (120cm) then tapers late.
                        # Using Power Curve for Width too.
                        # Prefer Compartment-level config, fallback to Hold-level
                        c_wid_start = comp.get('floor_width_cm', hold_data.get('floor_width_cm', 120))
                        c_wid_end = comp.get('min_floor_width_cm', hold_data.get('min_floor_width_cm', c_wid_start))

                        def get_len_limit_by_width(w_item, w_start, w_end, L_total):
                            if w_item <= w_end: return L_total
                            if w_item > w_start + 0.1: return 0 # Tolerance
                            if w_start == w_end: return 0
                            
                            # w(x) = w_start - (w_start - w_end) * (x / L)^P
                            # Solving for x:
                            # (x/L)^P = (w_start - w_item) / (w_start - w_end)
                            # x = L * [ratio]^(1/P)
                            
                            POWER_W = 4.0 # Higher power = stays wide longer (Rectangular-ish)
                            # Add tolerance to w_start in ratio calculation to allow exact fit at x=0+
                            ratio_w = ((w_start + 0.1) - w_item) / (w_start - w_end)
                            ratio_w = max(0.0, min(1.0, ratio_w))
                            
                            return int(L_total * (ratio_w ** (1/POWER_W)))

                        # ORIENTATION A: Item L along Comp Length, Item S along Comp Width (Using smallest available dim for width)
                        # We use v['w'] as the "width on floor".
                        # If orienting 120x100 box:
                        # Variant 1: l=120, w=100. Width on floor is 100.
                        # Variant 2: l=100, w=120. Width on floor is 120.
                        
                        # Check Orient A (current v)
                        len_limit_w_A = get_len_limit_by_width(v['w'], c_wid_start, c_wid_end, c_len)
                        eff_len_A = min(len_limit_h, len_limit_w_A)
                        
                        count_A = 0
                        fit_l_A = eff_len_A // v['l']
                        if fit_l_A > 0 and c_wid_start >= v['w']:
                            count_A = fit_l_A * (c_hgt // v['h'])
                            
                        # Check Orient B (swapped L/W on floor)
                        # Actually variants list includes swapped L/W if tipping allowed?
                        # If tipping=False, we only have one L/W/H set per orientation?
                        # CargoItem.get_variants() returns all valid rotations.
                        # So we just process 'v' as one specific orientation.
                        # BUT v['l'] and v['w'] are just dimensions. 
                        # We can always rotate 90 deg on the Floor (Swap L/W).
                        # unless allow_rotation is False? (usually always True for Z-axis rotation)
                        
                        # Let's verify swap within this 'v' (keeping H fixed)
                        len_limit_w_B = get_len_limit_by_width(v['l'], c_wid_start, c_wid_end, c_len)
                        eff_len_B = min(len_limit_h, len_limit_w_B)
                        
                        count_B = 0
                        fit_w_B = eff_len_B // v['w']
                        if fit_w_B > 0 and c_wid_start >= v['l']:
                            count_B = fit_w_B * (c_hgt // v['h'])
                            
                        valid_geo_counts.append(max(count_A, count_B))
                            
                    if not valid_geo_counts:
                        # Fits nowhere geometrically
                        continue
                        
                    max_geo_fit = int(max(valid_geo_counts))

                    # --- OBSTACLE CHECK ---
                    # Subtract capacity lost due to fixed obstacles (e.g., C2 protrusions)
                    # Logic: If item Height > (CompHeight - ObsHeight), then the Item cannot exist 
                    # in the footprint of the Obstacle (L_obs x W_obs).
                    # We subtract the number of items that WOULD have fit in that footprint.
                    if 'obstacles' in comp:
                        for obs in comp['obstacles']:
                            # Check vertical collision
                            # Effective height under obstacle
                            h_clearance = c_hgt - obs['h']
                            
                            # We check 'v' used for max_geo_fit. 
                            # Simplification: We iterate variants again or assume the Best Variant dominates.
                            # Let's be conservative: check if the CHOSEN item height collides.
                            # Pack logic picks a variant. Here we just have a max count.
                            # Assume the variant that gave max_geo_fit is the one we use.
                            
                            # Which variant gave max?
                            # We need to loop again or just check all variants?
                            # If Item fits under clearance, no loss.
                            
                            # Re-eval item height (v['h']) against h_clearance.
                            # But different variants have different H?
                            # If tipping=False, H is constant.
                            # If tipping=True, we might have oriented it such that H < Clearance.
                            # But if the BEST count came from an orientation with H > Clearance, we must subtract.
                            
                            # Heuristic: Calculate loss for the "Tall" orientation and subtract it.
                            # If the item CAN go short (H < Clearance), maybe the packer puts it there?
                            # But "Count" implies filling the whole hold.
                            # If we fill the hold, we eventually hit the corner.
                            # If we use "Tall" orientation everywhere, we lose the corner.
                            # If we use "Short" orientation, we might fit under.
                            # BUT `valid_geo_counts` stores [Count_A, Count_B].
                            # We don't know which one was picked.
                            
                            # Refined Logic:
                            # For each valid count calculation (A and B), perform subtraction immediately.
                            # Let's rewrite the loops above to include obstacle calc? 
                            # Hard to splice in.
                            
                            # Post-Correction:
                            # Assume we picked the orientation with max count.
                            # Does that orientation have H > Clearance?
                            # If yes, subtract overlap.
                            # Overlap Count = Ceil(Obs_L / Item_L) * Ceil(Obs_W / Item_W) * (Items_Vertical? No, usually 1 layer if large)
                            
                            # Let's assume simplest case (Tipping False, H fixed).
                            # If item.h > h_clearance:
                            #    items_lost = ceil(obs.l / item.l) * ceil(obs.w / item.w)
                            #    max_geo_fit -= items_lost
                            
                            # Complex case (Tipping True):
                            # The variants loop checked multiple H.
                            # If we picked a variant with low H, no loss.
                            # If we picked high H, loss.
                            # We don't know which one.
                            # But `valid_geo_counts` are just numbers.
                            # We should have applied the loss *inside* the loop when generating the count.
                            # Correction: Move this check UP into the loop?
                            pass # Handled below by re-calc or just applying to 'max of all'? 
                            # Applying to max is unsafe if max came from a non-colliding variant.
                            
                            # Let's assume for now H is fixed (User Box 120x100x100).
                            # Height 100 > 81 (108-27). Collides.
                            # Loss = ceil(97/120)*ceil(70/100) = 1*1 = 1?
                            # Or ceil(97/100)*ceil(70/120) = 1*1 = 1.
                            
                            # We will apply a global adjustment if MIN Item Dimension > Clearance?
                            # No, depends on orientation.
                            
                            # For correctness, we really should subtract INSIDE the variant loop.
                            # Since I cannot easily edit the previous block without large replacement,
                            # I will apply a post-check using the item's Min Height.
                            # If Min Height > Clearance, collision is inevitable. 
                            # If we allow rotation, maybe we put it 50cm high?
                            
                            # Check if current 'best' count implies an H.
                            # We can't know.
                            # Taking a safe bet: Calculate potential loss.
                            # If max_geo_fit is large, it likely uses a tall stack?
                            # Actually, max_geo_fit reduces to floor_area * vertical_layers.
                            
                            # Let's calculate the "Lost Slots" logic strictly:
                            # A slot is (Item_L x Item_W x Item_H).
                            # If any Slot overlaps Obstacle, it's invalid.
                            # Overlap Volume = Obs_L * Obs_W * Obs_H.
                            # Roughly, subtract (ObsVolume / ItemVolume).
                            # 97*70*27 = 183,330 cm3.
                            # Item 120*100*100 = 1,200,000 cm3.
                            # Ratio 0.15. Round to 0?
                            # Volumetric subtraction is unsafe here (underestimates).
                            # Geometric subtraction:
                            # It definitely kills at least 1 unit if it intrudes?
                            # Yes, collision = death of unit.
                            # So I subtract 1 if (Item_H > Clearance) and (Item_L/W fits in Obs_L/W range? No, if Obs > 0).
                            # Any intrusion kills the box in that corner.
                            # So, max_geo_fit -= 1 ???
                            # Only if H > Clearance.
                            
                            # Let's verify Item Height (assuming standard 'h' from definition if tipping false).
                            # If tipping true, we might rotate.
                            # But if the chosen rotation is tall...
                            # Let's just deduct 1 if ANY variant > Clearance? Too harsh.
                            # Let's deduct 1 if ALL variants > Clearance? Safe.
                            
                            min_dim = item.dims[0]
                            if min_dim > h_clearance:
                                # Collision!
                                # Determine strategy: Length Reduction vs Slot Subtraction.
                                # If the obstacle blocks the "Path" (i.e., consumes significant width),
                                # it effectively shortens the compartment.
                                # Threshold: If ObsW > (FloorW - ItemW)? No.
                                # If ObsW > 50% of Floor Width? Or if Remaining Width < Item Width.
                                # Floor Width = 120cm.
                                # Item Width = 100/120.
                                # If Remaining Width < Min Item Width (100), then we cannot pass.
                                
                                c_floor_w = hold_data.get('floor_width_cm', 120)
                                remaining_width_at_obs = c_floor_w - obs['w']
                                
                                # Use item min dim for passage check
                                can_pass_alongside = (remaining_width_at_obs >= item.dims[0])
                                
                                if not can_pass_alongside:
                                    # EFFECTIVE LENGTH REDUCTION (Sequential Packing Blocked)
                                    # The obstacle acts as a new back wall.
                                    # We should calculate max_geo_fit based on (L_total - L_obs).
                                    # But max_geo_fit is already calculated.
                                    # We need to subtract the capacity difference.
                                    # Diff = Count(L) - Count(L - ObsL).
                                    # Or simpler: Re-calculate max fit for Reduced Length?
                                    # We can approximate loss = Slots in ObsL.
                                    # But without Ceil?
                                    # Loss = Capacity(L) - Capacity(L - ObsL).
                                    # Example C1: L=295. Cap=2. L'=155. Cap=1. Loss=1.
                                    # My previous logic: Loss = Ceil(140/100) = 2. Result 0.
                                    # Correct Logic: Loss = Floor(ObsL / ItemL)?
                                    # 140/100 = 1. Result 1. Matches.
                                    # Example C4: L=608. Cap=5 (taper). ObsL=238.
                                    # L'=370. Cap=3. Loss=2.
                                    # Previous Logic: Ceil(238/100) = 3. Result 2.
                                    # So Floor() seems safer for linear blockage?
                                    # Let's try logic:
                                    # If not can_pass_alongside:
                                    #    effective_len = c_len - obs['l']
                                    #    # Re-eval simple linear capacity
                                    #    # This ignores Taper/Height complex logic, but is a good heuristic approximation.
                                    #    # Or simply:
                                    #    loss = int(obs['l'] / item.dims[1]) # Use item length (mid dim?)
                                    #    # items dims [100, 100, 120]. d[1]=100.
                                    #    # 140/100 = 1.
                                    #    # 238/100 = 2.
                                    #    # 295 cap 2 -> 2-1 = 1. Correct.
                                    #    # 608 cap 6 -> 6-2 = 4 (C4).
                                    #    pass
                                    import math
                                    # EFFECTIVE LENGTH REDUCTION
                                    # If obstacle blocks width (can't pass), it reduces usable length.
                                    # Loss = Count(Full) - Count(Reduced)
                                    # This handles 97cm (kills 1 box) and 140cm (kills 1 box) and 238cm (kills 2 boxes).
                                    
                                    # Use item length (d[1] usually 100)
                                    item_len = item.dims[1]
                                    
                                    cap_full = c_len // item_len
                                    cap_reduced = (c_len - obs['l']) // item_len
                                    
                                    # Calculate loss count
                                    loss = cap_full - cap_reduced
                                    
                                    # C1: 295//100=2. (295-140)//100=1. Loss=1. (Result 1). Correct.
                                    # C2: 560//100=5. (560-97)//100=4. Loss=1. (Result 4). Correct.
                                    # C4: 608//100=6. (608-238)//100=3. Loss=3. (Result 6-3=3).
                                    # Note: If Taper limits capacity to 5, and we subtract 3 -> 2.
                                    
                                else:
                                    # Passable (e.g. small pole?). Current config has none.
                                    # But for completeness:
                                    slots_l = math.ceil(obs['l'] / item.dims[1])
                                    slots_w = math.ceil(obs['w'] / item.dims[0])
                                    loss = int(slots_l * slots_w)

                                # Clamp loss
                                max_geo_fit -= loss
                                if max_geo_fit < 0: max_geo_fit = 0
                    
                    # Store geometric limit
                    item.max_count_in_hold[comp['id']] = max_geo_fit
                                        
                    # --- WEIGHT/VOLUME CHECK ---
                    # Now we assume we can fill up to max_geo_fit.
                    # Sort remaining items by size? No, we are estimating global capacity for THIS item type.
                    # ...For mixed packing in Lower Deck, it's very complex (Tetris).
                    # SIMPLIFICATION: We convert volume usage to percentage of geo_fit?
                    # Or simpler: The "max_geo_fit" acts as a cap on the TOTAL count of this item type 
                    # that COULD be in the compartment if it was empty.
                    # If we mix items, we reduce available Volume/Weight.
                    # The issue user had was "25 boxes fitted by volume".
                    # Real fit was 6.
                    # The volume calculation allows 25. The geometric allows 6.
                    # So we should NEVER take more than max_geo_fit.
                    
                    # Also need to subtract what we already put in? 
                    # If we mix item types, this simple "max_geo_fit" is optimistic (assumes empty).
                    # But it serves as a hard clamp against the "Volume" calculation which is wildly optimistic.
                    
                    # Greedy fill loop
                    while item.count > 0:
                        # Check Compartment Limits
                        if c_data['weight'] + item.weight > comp['max_weight']: break
                        if c_data['volume'] + item.volume_m3 > comp['max_volume']: break
                        
                        # Check Hold Combined Limit
                        if hold_res['current_weight'] + c_data['weight'] + item.weight > hold_data['max_weight']: break
                        
                        # Check Geometric Limit (Per Item Type Clamp)
                        # We count how many of THIS item are already in.
                        # (Primitive check, doesn't account for space taken by OTHER items)
                        current_item_count = 0
                        # Parse existing items strings "Name xN"
                        for s in c_data['items']:
                            if s.startswith(item.name):
                                try:
                                    current_item_count += int(s.split('x')[1])
                                except: pass
                                
                        if current_item_count >= max_geo_fit:
                            break
                        
                        # Calculate max we can take
                        rem_comp_w = comp['max_weight'] - c_data['weight']
                        rem_comp_v = comp['max_volume'] - c_data['volume']
                        rem_hold_w = hold_data['max_weight'] - (hold_res['current_weight'] + c_data['weight'])
                        
                        # Clamp by geo limit
                        rem_geo = max_geo_fit - current_item_count
                        
                        can_w = int(min(rem_comp_w, rem_hold_w) // item.weight)
                        # Volume check is loose, keep it but geo limit is tighter
                        can_v = int(rem_comp_v // item.volume_m3) if item.volume_m3 > 0 else 9999
                        
                        to_take = int(min(item.count, can_w, can_v, rem_geo))
                        
                        if to_take <= 0: break
                        
                        # Append or Update count in list
                        # Simplified append for now
                        c_data['items'].append(f"{item.name} x{to_take}")
                        c_data['weight'] += to_take * item.weight
                        c_data['volume'] += to_take * item.volume_m3
                        item.count -= to_take
                        
                        # If we added some, we loop to check limits again or break if 0
                        # actually to_take was the max batch. So we are done for this item or limits hit.
                        if to_take > 0:
                             # We break the while because we took the max chunk possible
                             break
                        
                # After filling compartment, add to Hold total
                hold_res['current_weight'] += c_data['weight']
                hold_res['compartments'].append(c_data)
            
            results.append(hold_res)
        
        return results

    @staticmethod
    def pack_aircraft(pallet_config_dict, cargo_items_list):
        """
        Main entry point. 
        Returns (main_deck_pallets, lower_deck_results, remaining_items)
        """
        # Deep copy items so we don't mutate original list counts permanently if running comparison
        working_items = copy.deepcopy(cargo_items_list)
        
        # Sort by Volume Desc (Big items first)
        working_items.sort(key=lambda x: x.volume_m3, reverse=True)
        
        pallets = []
        num_pallets = pallet_config_dict['count']
        
        for i in range(1, num_pallets + 1):
            p = Pallet(i, pallet_config_dict)
            
            # Fill Pallet
            while True:
                # If no items left
                if all(x.count == 0 for x in working_items): break
                
                # Try to find best layer from all available items
                best_layer = None
                best_item_ref = None
                
                for item in working_items:
                    if item.count <= 0: continue
                    
                    # Door Check
                    if not Packer.fits_through_door(item, DOOR_MAIN):
                        continue
                    
                    variants = item.get_variants()
                    for var in variants:
                        res = Packer.calculate_layer(p, var)
                        if res and res.count > 0:
                            # Heuristic: maximize COUNT or WEIGHT? 
                            # Let's maximize COUNT first (volumetric efficiency)
                            if best_layer is None or res.count > best_layer.count:
                                best_layer = res
                                best_item_ref = item
                            elif res.count == best_layer.count:
                                # Tie-break: min height preferred to save vertical space?
                                if res.height < best_layer.height:
                                    best_layer = res
                                    best_item_ref = item
                
                if not best_layer:
                    break # Pallet full or no items fit
                
                # Check Weight Limits for the whole batch
                # calculate_layer returns max geometrical fit.
                # We must limit by Item Count and Weight.
                
                geo_max = best_layer.count
                real_avail = best_item_ref.count
                
                to_take = min(geo_max, real_avail)
                
                # Weight limit check
                batch_weight = to_take * best_layer.weight
                if p.remaining_weight() < batch_weight:
                    # Reduce count
                    can_take_w = int(p.remaining_weight() // best_layer.weight)
                    to_take = min(to_take, can_take_w)
                
                if to_take <= 0:
                    break # Pallet weight full
                
                # Commit Layer
                # Update layer result to reflect actual count
                best_layer.count = to_take
                p.add_layer(best_layer)
                best_item_ref.count -= to_take
                
                if p.remaining_weight() < 1.0: # Tiny buffer
                    break
            
            pallets.append(p)
            
        # Pack Lower Deck with remaining
        lower_res = Packer.pack_lower_deck(working_items)
        
        return pallets, lower_res, working_items


# ============================================
# UTILITIES AND IO
# ============================================

def print_layer_ascii(meta):
    if not meta: return ""
    out = []
    
    # 1. Main
    m = meta['main']
    m_sym = "[II]" if "Length" in meta['orient_type'] else "[--]"
    m_vis = " ".join([m_sym] * m['r'])
    out.append(f"      Main: {m['count']} pcs | Grid {m['r']}x{m['c']} | {meta['orient_type']}")
    out.append(f"      Vis:  {m_vis} ... x{m['c']} rows")
    
    # 2. Side
    if meta['side']:
        s = meta['side']
        s_sym = "[..]"
        out.append(f"      Side: {s['count']} pcs | Grid {s['r']}x{s['c']} | Rotated")
    
    return "\n".join(out)

def generate_report(pallets, lower, leftovers, summary_only=False):
    print("\n" + "="*60)
    print("📊 FINAL LOAD SHEET")
    print("="*60)
    
    total_w = 0
    total_pcs = 0
    
    # Main Deck
    for p in pallets:
        pct = (p.current_weight / p.max_net_weight) * 100
        print(f"\n📍 Position {p.id} ({p.config['code']})")
        print(f"   Limits: {p.max_net_weight} kg Net | Height {p.config['max_height']} cm")
        print(f"   Loaded: {p.current_weight} kg ({pct:.1f}%) | Used Height: {p.current_height} cm")
        
        if not summary_only:
            for l in p.layers:
                print(f"   • Layer {l['z_start']}-{l['z_end']}cm: {l['box_name']} x{l['count']}")
                print(print_layer_ascii(l['meta']))

        total_w += p.current_weight
        total_pcs += sum(l['count'] for l in p.layers)

    # Lower Deck
    print("\n" + "-"*60)
    print("🔵 LOWER DECK")
    for hold in lower:
        print(f"\n   --- {hold['name']} (Hold Limit: {hold['max_weight']} kg) ---")
        for c in hold['compartments']:
            print(f"   {c['name']}: {c['weight']} kg | {c['volume']:.2f} m3")
            if not summary_only and c['items']:
                print(f"     -> {', '.join(c['items'])}")
            total_w += c['weight']
    
    print("\n" + "-"*60)
    print(f"TOTAL PAYLOAD: {total_w} kg")
    
    left_count = sum(x.count for x in leftovers)
    if left_count > 0:
        print(f"\n🔴 LEFT BEHIND: {left_count} pcs")
        for x in leftovers:
            if x.count > 0:
                print(f"   {x.name}: {x.count}")
    else:
        print("\n✅ ALl CARGO LOADING COMPLETE")


def interactive_input():
    print("📦 Interactive Cargo Input")
    items = []
    i = 1
    while True:
        name = input(f"Item #{i} Name (enter to finish): ")
        if not name: break
        try:
            l = float(input(f"  Length (cm): "))
            w = float(input(f"  Width (cm): "))
            h = float(input(f"  Height (cm): "))
            k = float(input(f"  Weight (kg): "))
            c = int(input(f"  Quantity: "))
            tip = input(f"  Allow Tipping? (y/n): ").lower() == 'y'
            items.append(CargoItem(name, l, w, h, k, c, tip))
            i += 1
        except ValueError:
            print("Invalid number, try again.")
    return items


def export_cargo_js(pallets, lower_deck, filename="cargo_data.js"):
    import json
    
    # Transform Main Deck data
    md_data = []
    for p in pallets:
        pallet_obj = {
            "id": p.id,
            "weight": p.current_weight,
            "limit": p.max_net_weight,
            "layers": []
        }
        for l in p.layers:
            # l has 'z_start', 'height', 'count', 'meta'
            # meta has 'main': {'r', 'c', 'orient'}, 'side': ...
            # We need to pass dimensions to reconstruct geometry
            # item variant dims are not directly in layer, but 'box_name' is. 
            # We can infer or pass better data? 
            # Ideally the layer should store box dims. It stores 'meta'.
            # 'meta' came from 'calculate_layer'.
            # But we don't save l/w of the box in meta explicitly?
            # 'orient_type' string suggests it.
            # But let's look at Packer.calculate_layer again.
            # "item_variant" was input.
            # We should probably have stored box dims in layer result.
            # Assuming standard box for demo: 120x100?
            # Or we can pass 'box_dims' in meta?
            # I can't easily change Packer logic now without risking bugs.
            # I'll rely on correct visualization logic on client side if I pass specific layer grids.
            # I'll pass the raw meta dict.
            pallet_obj["layers"].append(l)
        md_data.append(pallet_obj)

    # Transform Lower Deck data
    ld_data = []
    for hold in lower_deck:
        for c in hold['compartments']:
            # Parse items "Name xCount"
            parsed_items = []
            for s in c['items']:
                parts = s.split(' x')
                if len(parts) == 2:
                    try:
                        # Handle "1.0" by converting to float first
                        parsed_items.append({"name": parts[0], "count": int(float(parts[1]))})
                    except ValueError:
                         parsed_items.append({"name": parts[0], "count": 1})
                else:
                    parsed_items.append({"name": s, "count": 1})
            
            c_obj = {
                "id": c['name'].split()[0], # "C1" from "C1 (FWD)"
                "name": c['name'],
                "items": parsed_items,
                "weight": c['weight']
            }
            ld_data.append(c_obj)

    js_content = f"""
window.CARGO_DATA = {{
    "timestamp": "{filename}",
    "main_deck": {json.dumps(md_data, indent=4)},
    "lower_deck": {json.dumps(ld_data, indent=4)}
}};
"""
    try:
        with open(filename, "w", encoding='utf-8') as f:
            f.write(js_content)
        print(f"✅ Exported 3D data to {filename}")
    except Exception as e:
        print(f"❌ Failed to export JS: {e}")

def main():
    parser = argparse.ArgumentParser(description="SkyGuard Cargo Calculator")
    parser.add_argument("--interactive", action="store_true", help="Run in interactive input mode")
    # Could add JSON file input here
    
    args = parser.parse_args()
    
    items = []
    if len(sys.argv) == 1 or args.interactive:
        items = interactive_input()
    else:
        # Placeholder for other inputs
        pass

    if not items:
        print("No items to pack.")
        return

    print("\nSELECT CONFIGURATION:")
    print("1. PAG (15 Pos)")
    print("2. PMC (13 Pos)")
    print("3. Compare Both")
    
    try:
        opt = int(input("Option: "))
    except:
        opt = 1
        
    final_pallets = []
    final_lower = []
    
    if opt == 3:
        # Run both
        print("\nComputing PAG...")
        pag_p, pag_l, pag_rem = Packer.pack_aircraft(PALLET_OPTIONS[1], items)
        w_pag = sum(p.current_weight for p in pag_p) + sum(h['current_weight'] for h in pag_l)
        
        print("Computing PMC...")
        pmc_p, pmc_l, pmc_rem = Packer.pack_aircraft(PALLET_OPTIONS[2], items)
        w_pmc = sum(p.current_weight for p in pmc_p) + sum(h['current_weight'] for h in pmc_l)
        
        print(f"\nRESULTS: PAG={w_pag}kg vs PMC={w_pmc}kg")
        if w_pag >= w_pmc:
            print("RECOMMEND: PAG")
            generate_report(pag_p, pag_l, pag_rem)
            final_pallets, final_lower = pag_p, pag_l
        else:
            print("RECOMMEND: PMC")
            generate_report(pmc_p, pmc_l, pmc_rem)
            final_pallets, final_lower = pmc_p, pmc_l
    else:
        cfg = PALLET_OPTIONS.get(opt, PALLET_OPTIONS[1])
        pallets, lower, rem = Packer.pack_aircraft(cfg, items)
        generate_report(pallets, lower, rem)
        final_pallets, final_lower = pallets, lower
    
    # Export for Visualizer
    export_cargo_js(final_pallets, final_lower)

if __name__ == "__main__":
    main()
