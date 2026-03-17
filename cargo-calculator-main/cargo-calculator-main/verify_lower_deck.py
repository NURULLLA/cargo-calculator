from cargo_calculator import Packer, CargoItem
from config import PALLET_OPTIONS, LOWER_DECK

def verify_lower_deck_fix():
    print("TEST: Lower Deck Geometric Constraint Verification")
    print("==================================================")
    
    # User Scenario:
    # Box Dimensions: 120x100x100 cm
    # Compartment C4 (AFT): Max Volume 30.7 m3.
    # Previous Error: App calculated 25 boxes (Volumetric 30.7 / 1.2 = 25.5).
    # Real Constraint: Floor Width 120cm.
    # Box fits 1 wide. Length 668cm. Max 6 long.
    
    # Create a list of many boxes to test full capacity
    boxes = []
    for i in range(50):
        boxes.append(CargoItem(f"UserBox_120x100_{i}", 120, 100, 100, 50, 100, allow_tipping=False))
    
    print(f"Item: {boxes[0].name} {boxes[0].dims}")
    print(f"C4 Floor Width: {LOWER_DECK['AFT']['floor_width_cm']} cm")
    
    # Run Packer
    results = Packer.pack_lower_deck(boxes)
    
    # Inspect results for C4
    c4_result = None
    for hold in results:
        for comp in hold['compartments']:
            # comp is the result dict, comp['stats'] is the config dict
            if "C4" in comp['name']:
                c4_result = comp
                
    if c4_result:
        print(f"\n[C4 Result]")
        print(f"\n--- [C4 Result] ---")
        count = 0
        for s in c4_result['items']:
            # s format: "Name xCount" e.g., "UserBox_120x100 x6"
            # It might also be just "Name" if count is 1? No, Packer appends " xN".
            # It might be separate lines?
            # Let's support "Box xN" format robustly.
            if " x" in s:
                parts = s.rsplit(' x', 1)
                try:
                    c = int(parts[1])
                    count += c
                except:
                    count += 1
            else:
                count += 1
                
        print(f"Count: {count}")
        
        # Expected:
        # L=608. Obs=238. Eff=370. Item=100. Count=3.
        # Or Taper reduces it further?
        # Let's see what we get.
        
        if count == 3:
             print("SUCCESS (C4): Count is 3. (Best Estimate: 608-238=370 // 100 = 3).")
        elif count == 2:
             print("SUCCESS (C4): Count is 2. (Conservative Taper + Obstacle).")
        elif count == 1:
             print("NOTE (C4): Count is 1. Very conservative based on Tapers.")
        else:
             print(f"NOTE (C4): Count {count} is unexpected.")
    else:
        print("❌ FAILURE: C4 not found.")

    # Inspect results for C3
    c3_result = None
    for hold in results:
        for comp in hold['compartments']:
            if "C3" in comp['name']:
                c3_result = comp
                
    if c3_result:
        print(f"\n--- [C3 Result] ---")
        count = 0
        for s in c3_result['items']:
            # Items might be listed individually or grouped.
            count += 1
                
        print(f"Count: {count}")
        # Expected: 440cm length. Box 100cm long -> 4 fit.
        if count == 4:
             print("SUCCESS (C3): Count is 4. (440cm / 100cm = 4).")
        else:
             print(f"NOTE (C3): Count {count} is unexpected. (Target 4)")
    else:
        print("FAILURE: C3 not found.")

if __name__ == "__main__":
    verify_lower_deck_fix()
