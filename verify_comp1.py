from cargo_calculator import Packer, CargoItem
from config import LOWER_DECK

def verify_comp1_obstacle():
    print("TEST: Lower Deck C1 Obstacle Verification")
    print("=========================================")
    
    # Scenario: C1 (FWD) has an obstacle 140x72x134.
    # C1 Length 295 cm.
    # Item: UserBox 120x100x100.
    # Obstacle consumes 140cm of length where Width is reduced to (120-72)=48cm.
    # Item Width 100 > 48, so cannot fit alongside obstacle.
    # Usable Length = 295 - 140 = 155 cm.
    # Item Length 100.
    # Capacity = 155 // 100 = 1 box.
    # (Without obstacle: 295 // 100 = 2 boxes).
    
    # Create single item with large count
    box = CargoItem("UserBox_120x100", 120, 100, 100, 50, 100, allow_tipping=False)
    
    # Run Packer
    results = Packer.pack_lower_deck([box])
    
    # Inspect results for C1
    c1_result = None
    for hold in results:
        for comp in hold['compartments']:
            if "C1" in comp['name']:
                c1_result = comp
                
    if c1_result:
        print(f"\n[C1 Result]")
        count = 0
        for s in c1_result['items']:
            # s format "Name xCount"
            if "UserBox" in s:
                parts = s.rsplit(' x', 1)
                if len(parts) == 2:
                    current = int(parts[1])
                    count += current
                
        print(f"Count: {count}")
        
        if count == 1:
             print("✅ SUCCESS (C1): Count is 1. (295-140 = 155 // 100 = 1).")
        elif count == 2:
             print("❌ FAILURE (C1): Count is 2. Obstacle ignored.")
        elif count == 0:
             print("❌ FAILURE (C1): Count is 0. Too aggressive.")
        else:
             print(f"⚠️ NOTE (C1): Count {count} is unexpected. (Target 1)")
    else:
        print("❌ FAILURE: C1 not found.")

if __name__ == "__main__":
    verify_comp1_obstacle()
