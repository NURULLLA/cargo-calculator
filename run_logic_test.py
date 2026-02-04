import sys
from cargo_calculator import CargoItem, Packer, generate_report, export_cargo_js
from config import PALLET_OPTIONS

def run_test():
    print("RUNNING FULL SYSTEM TEST: Main Deck + Lower Deck")
    
    # Create Test Item
    # Quantity 300 boxes to ensure we fill Main Deck (approx 15-20 boxes per pallet * 15 pallets = 225-300)
    # and spill over to Lower Deck.
    item = CargoItem("TestBox", 120.0, 100.0, 100.0, 80.0, 300, allow_tipping=False)
    cargo_list = [item]
    
    # Use PAG configuration (Option 1)
    cfg = PALLET_OPTIONS[1]
    
    print("\n--- PACKING AIRCRAFT (PAG) ---")
    # This runs the full logic: Main Deck -> Leftovers -> Lower Deck
    pallets, lower, rem = Packer.pack_aircraft(cfg, cargo_list)
    
    # Generate Report (prints to stdout)
    generate_report(pallets, lower, rem)
    
    # Check if Main Deck has data
    md_count = sum(len(p.layers) for p in pallets)
    print(f"\nMain Deck Pallets Used: {len(pallets)}")
    
    # Check Lower Deck data
    ld_count = sum(len(c['items']) for h in lower for c in h['compartments'])
    print(f"Lower Deck Compartments Used: {len(lower)*2} (approx)")

    # Export for visualization
    export_cargo_js(pallets, lower, "cargo_data.js")
    print(f"\nData exported to cargo_data.js. Status: {'SUCCESS' if md_count > 0 and len(lower) > 0 else 'WARNING'}")

if __name__ == "__main__":
    run_test()
