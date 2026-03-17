from cargo_calculator import Packer, CargoItem
from config import LOWER_DECK

def verify_comp2_obstacle():
    print("TEST: Lower Deck C2 Obstacle Verification")
    print("=========================================")
    
    # Scenario: C2 (FWD) has an obstacle 97x70x27 at Upper Right.
    # Clearance under obstacle = 108 - 27 = 81 cm.
    # User Box: 120x100x100. Min dim = 100.
    # 100 > 81, so it collides.
    # C2 Length 560.
    # Without obstacle: fits 5 boxes (100cm L).
    # With obstacle: Should fit 4 boxes (loses 1 slot).
    
    # Create a single item type with large count to test clamping
    box = CargoItem("UserBox_120x100", 120, 100, 100, 50, 100, allow_tipping=False)
    
    print(f"Item: {box.name} {box.dims}")
    
    # Run Packer
    results = Packer.pack_lower_deck([box])
    
    # Inspect results for C2
    c2_result = None
    for hold in results:
        for comp in hold['compartments']:
            if "C2" in comp['name']:
                c2_result = comp
                
    if c2_result:
        print(f"\n--- [C2 Result] ---")
        count = 0
        for s in c2_result['items']:
            # s format "Name xCount"
            if "UserBox" in s:
                parts = s.rsplit(' x', 1)
                if len(parts) == 2:
                    current = int(parts[1])
                    count += current
                
        print(f"Count: {count}")
        # Expected: 560cm - 97cm = 463cm. 4 boxes.
        if count == 4:
             print("✅ SUCCESS (C2): Count is 4. (560-97 = 463 // 100 = 4).")
        elif count == 5:
             print("❌ FAILURE (C2): Count is 5. Obstacle ignored.")
        else:
             print(f"⚠️ NOTE (C2): Count {count} is unexpected. (Target 4)")
    else:
        print("❌ FAILURE: C2 not found.")

if __name__ == "__main__":
    verify_comp2_obstacle()
