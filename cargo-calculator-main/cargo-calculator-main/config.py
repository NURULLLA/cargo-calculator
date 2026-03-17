# ============================================
# CONFIGURATION AND CONSTANTS
# ============================================

AIRCRAFT_NAME = "Boeing 757-200 PCF"

# --- MAIN DECK CONFIG ---
MAX_FUSELAGE_HEIGHT_CM = 208

# DOOR DIMENSIONS (cm)
DOOR_MAIN = {"width": 340, "height": 218}
DOOR_FWD_BELLY = {"width": 140, "height": 108}
DOOR_AFT_BELLY = {"width": 140, "height": 112}

# PAG CONFIG (Config A)
# Default for 2-7 and 10-15 is 2948.
PAG_WEIGHT_LIMITS = {
    1: 2716,
    8: 4264,
    9: 4264
}
PAG_DEFAULT_WEIGHT = 2948

# PMC CONFIG (Config M)
# Default for 2-5 and 8-13 is 3216.
PMC_WEIGHT_LIMITS = {
    1: 2856,
    6: 4652,
    7: 4652
}
PMC_DEFAULT_WEIGHT = 3216

PALLET_OPTIONS = {
    1: {
        "code": "PAG",
        "name": "PAG (High) - 15 positions",
        "count": 15,
        "length_cross": 303,    # cm (Usable: 317 - 14 border)
        "width_long": 209,      # cm (Usable: 223 - 14 border)
        "max_height": MAX_FUSELAGE_HEIGHT_CM,
        "tare_weight": 110,
        "contour_start_height": 114.3,
        "contour_mid_height": 174.5,
        "width_base": 304.0, # Manually enforced max usable width at base
        "width_fuselage_start": 317.0, # Actual fuselage width for taper calc
        "width_mid_taper": 223.0,
        "width_top": 117.0
    },
    2: {
        "code": "PMC",
        "name": "PMC (Wide) - 13 positions",
        "count": 13,
        "length_cross": 303,    # cm (Usable: 317 - 14 border)
        "width_long": 229,      # cm (Usable: 243 - 14 border)
        "max_height": MAX_FUSELAGE_HEIGHT_CM,
        "tare_weight": 117,
         "contour_start_height": 114.3,
        "contour_mid_height": 174.5,
        "width_base": 304.0,
        "width_fuselage_start": 317.0,
        "width_mid_taper": 223.0,
        "width_top": 117.0
    }
}

# --- LOWER DECK CONFIG ---
LOWER_DECK = {
    "FWD": {
        "name": "FWD HOLD",
        "max_weight": 7142,
        "door": DOOR_FWD_BELLY,
        "floor_width_cm": 120, # Assumed standard width similar to AFT
        "top_width_cm": 247,
        "compartments": [
            {
                "id": "COMP1", "name": "C1 (FWD)", 
                "max_weight": 2470, "max_volume": 5.2, 
                "max_length_cm": 295, "max_height_cm": 108,
                "obstacles": [
                    # Large Internal Structure (Parallelepiped)
                    # Dimensions from sketch: 140cm(L) x 72cm(W) x 134cm(H)
                    # Blocks full height (134 > 108).
                    {"l": 140, "w": 72, "h": 134, "name": "Structural Block"}
                ]
            },
            {
                "id": "COMP2", "name": "C2 (FWD)", 
                "max_weight": 4672, "max_volume": 14.6, 
                "max_length_cm": 560, "max_height_cm": 108,
                "obstacles": [
                    # Upper Right Corner Protrusion (Final Verified Dimensions)
                    # Dimensions: 97cm(L) x 70cm(W) x 27cm(H)
                    {"l": 97, "w": 70, "h": 27, "name": "Corner Protrusion"}
                ]
            }
        ]
    },
    "AFT": {
        "name": "AFT HOLD",
        "max_weight": 9379,
        "door": DOOR_AFT_BELLY,
        "floor_width_cm": 120, # Start width
        "min_floor_width_cm": 90, # End width (Tail constriction)
        "top_width_cm": 247,
        "compartments": [
            {
                "id": "COMP3", "name": "C3 (AFT)", 
                "max_weight": 3733, "max_volume": 14.25, 
                "max_length_cm": 440, "max_height_cm": 112,
                "min_floor_width_cm": 120 # No taper in C3
            },
            {
                "id": "COMP4", "name": "C4 (AFT)", 
                "max_weight": 5606, "max_volume": 30.7, 
                "max_length_cm": 608, "max_height_cm": 112,
                "min_floor_width_cm": 120, # Disable taper to ensure capacity
                "obstacles": [
                    # Large Structural Block (Parallelepiped)
                    # Dimensions from sketch: 238cm(L) x 72cm(W) x 134cm(H)
                    {"l": 238, "w": 72, "h": 134, "name": "Structural Block"}
                ]
            }
        ]
    }
}

# DEFAULT LIMITS IF NOT SPECIFIED
DEFAULT_POS_LIMIT = 2000
