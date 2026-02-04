from cargo_calculator import Packer, CargoItem
from config import PALLET_OPTIONS

def verify_maximization():
    print("LOGIC VERIFICATION TEST")
    print("=======================")
    
    # SCENARIO 1: PAG (303 x 209 cm usable)
    # We use 100x100 boxes.
    # Expectation: 3 wide (300cm), 2 deep (200cm) = 6 per layer.
    print("\nTEST 1: PAG Efficiency Check (303x209)")
    box_1 = CargoItem("Box 100x100", 100, 100, 50, 10, 100, allow_tipping=False)
    
    config_pag = PALLET_OPTIONS[1]
    pallets, _, _ = Packer.pack_aircraft(config_pag, [box_1])
    
    p1 = pallets[0]
    l1 = p1.layers[0]
    print(f"  PAG Usable: 303x209")
    print(f"  Box: 100x100")
    print(f"  Result Layer: {l1['layout']}")
    print(f"  Count per layer: {l1['count']}")
    
    expected = 6
    if l1['count'] == expected:
        print("  ✅ SUCCESS: Packer maximized grid (3x2 = 6)")
    else:
        print(f"  ❌ FAILURE: Expected {expected}, got {l1['count']}")

    # SCENARIO 2: PMC (303 x 229 cm usable)
    # We use 100x110 boxes.
    # Width 303 -> 3 boxes (300 used)
    # Length 229 -> 2 boxes (220 used)
    # Total 6
    print("\nTEST 2: PMC Efficiency Check (303x229)")
    box_2 = CargoItem("Box 100x110", 110, 100, 50, 10, 100, allow_tipping=False)
    
    config_pmc = PALLET_OPTIONS[2]
    pallets_pmc, _, _ = Packer.pack_aircraft(config_pmc, [box_2])
    
    p2 = pallets_pmc[0]
    l2 = p2.layers[0]
    print(f"  PMC Usable: 303x229")
    print(f"  Box: 110x100")
    print(f"  Result Layer: {l2['layout']}")
    print(f"  Count per layer: {l2['count']}")
    
    if l2['count'] == 6:
        print("  ✅ SUCCESS: Packer maximized grid (3x2 = 6)")
    else:
        print(f"  ❌ FAILURE: Expected 6, got {l2['count']}")

    # SCENARIO 3: Mixed Rotation (Side Filling)
    # PAG 303 x 209
    # Main Item: 200 length, 90 width.
    # Orient A (Len along 303): Fits 1 (200 used, 103 rem). 
    # Orient B (Len along 209): Fits 1 (200 used, 9 rem).
    # Let's try to force a side fill.
    # Area: 303 x 209.
    # Box: 140 x 100.
    # Orient A (140 along 303): 2 boxes (280 used, 23 rem). Depth 209 -> 2 boxes (200 used). Total 2x2 = 4.
    # Orient B (100 along 303): 3 boxes (300 used, 3 rem). Depth 209/140 = 1 box. Total 3x1 = 3.
    # Packer should choose A (4 boxes) over B (3 boxes).
    print("\nTEST 3: Rotation Selection for Max Count")
    box_3 = CargoItem("RectBox 140x100", 140, 100, 50, 10, 100, allow_tipping=False)
    
    pallets_rot, _, _ = Packer.pack_aircraft(config_pag, [box_3])
    l3 = pallets_rot[0].layers[0]
    print(f"  Result Count: {l3['count']} | Layout: {l3['layout']}")
    
    if l3['count'] == 4:
         print("  ✅ SUCCESS: Packer chose best rotation (4 vs 3)")
    else:
         print(f"  ❌ FAILURE: Expected 4, got {l3['count']}")


if __name__ == "__main__":
    verify_maximization()
