from cargo_calculator import Packer, CargoItem
from config import PALLET_OPTIONS, DOOR_MAIN

def test_packing_logic():
    print("TEST: Initializing Items...")
    
    # 1. Door Limit Test
    # Door Main is 340x218. 
    # Item that fits: 300x200x50 (Min dims 50, 200. 50<218, 200<340. OK)
    item_fits = CargoItem("FitsDoor", 300, 200, 50, 100, 1, False)
    # Item too big: 400x300x50 (Min dims 50, 300. 50<218 OK. 300<340 OK. Wait.)
    # Item too big: 400x300x250. (Min dims 250, 300. 250 > 218. Fail.)
    item_huge = CargoItem("HugeBox", 400, 300, 250, 500, 1, False)
    
    print(f"TEST: Door Check ({DOOR_MAIN['width']}x{DOOR_MAIN['height']})")
    print(f"  {item_fits.name} dims sorted: {item_fits.dims} -> Expect Pass")
    print(f"  {item_huge.name} dims sorted: {item_huge.dims} -> Expect Fail")
    
    # 2. Weight Limit Test
    # Pos 1 limit (PAG): 2716 kg. 
    # Pos 2 limit (PAG): 2948 kg.
    # Pos 8 limit (PAG): 4264 kg.
    
    # CASE A: Item > Pos 1 but < Pos 2 (e.g. 2800 kg)
    # Should skip Pos 1 and go to Pos 2.
    item_2800 = CargoItem("Item_2800kg", 100, 100, 50, 2800, 1, False)
    
    # CASE B: Item > Pos 2 but < Pos 8 (e.g. 4000 kg)
    # Should skip Pos 1, 2..7 and go to Pos 8.
    item_4000 = CargoItem("Item_4000kg", 100, 100, 50, 4000, 1, False)
    
    items = [item_fits, item_huge, item_2800, item_4000]
    
    print("\nTEST: Packing with PAG Configuration...")
    config = PALLET_OPTIONS[1]
    
    pallets, lower, leftovers = Packer.pack_aircraft(config, items)
    
    print(f"\nTEST RESULTS:")
    
    # Check Huge Box
    huge_packed = False
    for p in pallets:
        for l in p.layers:
            if l['box_name'] == "HugeBox": huge_packed = True
    
    if not huge_packed:
        print("  ✅ SUCCESS: HugeBox rejected (Door Limit).")
    else:
        print("  ❌ FAILURE: HugeBox was packed!")
        
    # Check 2800kg Item
    # Should be in Pos 2 (or 3-7)
    pos_2800 = None
    for p in pallets:
        for l in p.layers:
            if l['box_name'] == "Item_2800kg": pos_2800 = p.id
    
    if pos_2800 == 1:
        print(f"  ❌ FAILURE: Item_2800kg packed in Pos 1 (Limit 2716)")
    elif pos_2800 is not None:
        print(f"  ✅ SUCCESS: Item_2800kg packed in Pos {pos_2800} (Limit 2948)")
    else:
         print(f"  ⚠️ NOTE: Item_2800kg NOT packed.")

    # Check 4000kg Item
    # Should be in Pos 8 or 9
    pos_4000 = None
    for p in pallets:
        for l in p.layers:
            if l['box_name'] == "Item_4000kg": pos_4000 = p.id
            
    if pos_4000 in [8, 9]:
        print(f"  ✅ SUCCESS: Item_4000kg packed in Pos {pos_4000} (Limit 4264)")
    elif pos_4000 is not None:
        print(f"  ❌ FAILURE: Item_4000kg packed in Pos {pos_4000} (Should be 8 or 9)")
    else:
         print(f"  ⚠️ NOTE: Item_4000kg NOT packed.")

    # Check Total Weight
    total_w = sum(p.current_weight for p in pallets)
    print(f"\nTotal Main Deck Weight: {total_w} kg")

if __name__ == "__main__":
    test_packing_logic()
