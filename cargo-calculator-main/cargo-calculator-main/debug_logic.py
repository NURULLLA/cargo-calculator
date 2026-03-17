import cargo_calculator
from config import LOWER_DECK

# Mock user item: 120x100x100, 80kg
class MockItem:
    def __init__(self):
        self.name = "DEBUG_ITEM"
        self.dims = [100, 100, 120] # Sorted
        self.original_dims = [120, 100, 100]
        self.weight = 80
        self.priority = 0
        self.count = 100 # Plenty
        self.allow_tipping = False
        self.max_count_in_hold = {}
        self.volume_m3 = 1.2
    
    def get_variants(self):
        # Return standard orientation variants
        # Assuming allow_tipping=False, H=100 fixed.
        # Variants: L=120, W=100, H=100 AND L=100, W=120, H=100
        return [
            {'l': 120, 'w': 100, 'h': 100, 'weight': 80, 'name': 'DEBUG_ITEM', 'ref': self},
            {'l': 100, 'w': 120, 'h': 100, 'weight': 80, 'name': 'DEBUG_ITEM', 'ref': self}
        ]

item = MockItem()

print("--- DEBUG C3 (AFT) ---")
hold_data = LOWER_DECK['AFT']
comp = hold_data['compartments'][0] # C3 (440cm)
print(f"Compartment: {comp['name']} L={comp['max_length_cm']} H={comp['max_height_cm']}")

# Run Logic Trace Manually
c_len = comp['max_length_cm'] # 440
c_hgt = comp['max_height_cm'] # 112
c_min_hgt = comp.get('min_height_cm', c_hgt) # 112
c_wid_start = hold_data.get('floor_width_cm', 120) # 120
c_wid_end = hold_data.get('min_floor_width_cm', 120) # 90?

print(f"Width Start: {c_wid_start}, Width End: {c_wid_end}")

# Test Variant 1 (L=120, W=100)
v = {'l': 120, 'w': 100, 'h': 100}

# Width Limit Power Curve
def get_len_limit_by_width(w_item, w_start, w_end, L_total):
    if w_item <= w_end: return L_total
    if w_item > w_start: return 0
    if w_start == w_end: return 0
    
    POWER_W = 4.0 
    ratio_w = (w_start - w_item) / (w_start - w_end)
    ratio_w = max(0.0, min(1.0, ratio_w))
    limit = int(L_total * (ratio_w ** (1/POWER_W)))
    print(f"  Debug Width Limit: ItemW={w_item} Start={w_start} End={w_end} Ratio={ratio_w:.4f} Limit={limit}")
    return limit

len_limit_w = get_len_limit_by_width(v['w'], c_wid_start, c_wid_end, c_len)
count = len_limit_w // v['l']
print(f"Variant 1 (L=120, W=100): Fits len {len_limit_w} // 120 = {count}")

# Test Variant 2 (L=100, W=120)
v2 = {'l': 100, 'w': 120, 'h': 100}
len_limit_w2 = get_len_limit_by_width(v2['w'], c_wid_start, c_wid_end, c_len) # ItemW 120
count2 = len_limit_w2 // v2['l']
print(f"Variant 2 (L=100, W=120): Fits len {len_limit_w2} // 100 = {count2}")


print("\n--- DEBUG C4 (AFT) ---")
comp4 = hold_data['compartments'][1] # C4 (608cm)
c_len4 = comp4['max_length_cm']
print(f"Compartment: {comp4['name']} L={c_len4}")

# C4 is AFT, so Taper applies heavily?
# Width check
len_limit_w4 = get_len_limit_by_width(v['w'], c_wid_start, c_wid_end, c_len4)
count4_base = len_limit_w4 // v['l']
print(f"Variant 1 Base Fit: {count4_base}")

# Obstacle Check
# Obs: 238, 72, 134.
obs = comp4['obstacles'][0]
print(f"Obstacle: {obs}")
# Logic:
item_len = v['l'] # 120
cap_full = c_len4 // item_len # 608//120 = 5
cap_reduced = (c_len4 - obs['l']) // item_len # (608-238)//120 = 370//120 = 3
loss = cap_full - cap_reduced
print(f"Logic A (Using 120cm Item Length): Full={cap_full} Reduced={cap_reduced} Loss={loss}")

item_len_min = v['w'] # 100? No, standard logic uses Packer choice.
# If Variant 2 (L=100) is chosen?
# Base Fit V2: 
len_limit_w4_v2 = get_len_limit_by_width(v2['w'], c_wid_start, c_wid_end, c_len4)
count4_base_v2 = len_limit_w4_v2 // v2['l'] # 100
print(f"Variant 2 Base Fit: {count4_base_v2}")

cap_full_v2 = c_len4 // 100 # 6
cap_reduced_v2 = (c_len4 - obs['l']) // 100 # 370//100 = 3
loss_v2 = cap_full_v2 - cap_reduced_v2 # 3
print(f"Logic B (Using 100cm Item Length): Full={cap_full_v2} Reduced={cap_reduced_v2} Loss={loss_v2}")

print(f"Final Prediction C4: {count4_base_v2} - {loss_v2} = {count4_base_v2 - loss_v2}")
