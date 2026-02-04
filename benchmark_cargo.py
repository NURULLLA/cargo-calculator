from cargo_calculator import Packer, CargoItem
from config import PALLET_OPTIONS

def run_benchmark():
    print("🚀 PACKING EFFICIENCY BENCHMARK")
    print("===============================")
    
    # Create a complex manifest
    items = []
    
    # 1. 2000x Small uniform boxes (Electronic parts?)
    # 40x30x20 cm. 10kg.
    items.append(CargoItem("SmallBox", 40, 30, 20, 10, 2000, allow_tipping=True))
    
    # 2. 500x Medium boxes (Appliances)
    # 80x60x50 cm. 30kg.
    items.append(CargoItem("MedBox", 80, 60, 50, 30, 500, allow_tipping=False))
    
    # 3. 100x Large pallets/skids (Machinery)
    # 120x100x80 cm. 150kg.
    items.append(CargoItem("BigSkid", 120, 100, 80, 150, 100, allow_tipping=False))
    
    # 4. 1000x Filler bricks (Mail)
    # 30x20x10 cm. 2kg.
    items.append(CargoItem("MailPack", 30, 20, 10, 2, 1000, allow_tipping=True))

    total_vol = sum(x.volume_m3 * x.count for x in items)
    total_weight = sum(x.weight * x.count for x in items)
    
    print(f"Total Cargo Volume: {total_vol:.2f} m3")
    print(f"Total Cargo Weight: {total_weight} kg")
    
    # Run Packer (PAG)
    config = PALLET_OPTIONS[1]
    pallets, lower, leftovers = Packer.pack_aircraft(config, items)
    
    # Calculate Results
    packed_vol = 0
    packed_weight = 0
    
    for p in pallets:
        for l in p.layers:
            # Re-calculate volume of this layer
            # Count * (vol_of_one_item)
            # Find item ref or calculate from name?
            # We have metadata.
            # actually item volume is fixed.
            pass
            
    # Simpler: Check "leftovers"
    left_vol = sum(x.volume_m3 * x.count for x in leftovers)
    packed_vol = total_vol - left_vol
    
    efficiency = (packed_vol / total_vol) * 100
    
    print(f"\n--- RESULTS ---")
    print(f"Packed Volume: {packed_vol:.2f} m3")
    print(f"Leftover Vol:  {left_vol:.2f} m3")
    print(f"Volumetric Capture: {efficiency:.1f}%")
    
    print(f"Main Deck Pallets Used: {len(pallets)}")
    
    if len(leftovers) > 0:
        print(f"Leftovers: {sum(x.count for x in leftovers)} items")
        for x in leftovers:
            if x.count>0: print(f"  - {x.name}: {x.count}")
    else:
        print("All items packed.")
        
if __name__ == "__main__":
    run_benchmark()
