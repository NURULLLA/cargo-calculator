import sys
import os
import unittest
from unittest.mock import patch
import json

# Add current dir to path
sys.path.append(os.getcwd())

import cargo_calculator

class TestCargoCalculator(unittest.TestCase):
    
    @patch('builtins.input')
    def test_full_run_interactive(self, mock_input):
        print("Testing Full Run (Interactive + Export)...")
        # Mock inputs: 
        # Item 1: "BoxA", 100, 100, 100, 10, 5, y
        # Enter (finish)
        # Option: 1 (PAG)
        
        mock_input.side_effect = [
            "BoxA", "100", "100", "100", "10", "5", "y",
            "", # Finish item entry
            "1" # Choose PAG
        ]
        
        # Run main
        try:
            cargo_calculator.main()
        except SystemExit:
            pass # argparse might exit? No, we didn't pass --help
            
        # Check if cargo_data.js exists
        self.assertTrue(os.path.exists("cargo_data.js"), "cargo_data.js was not created.")
        
        # Validate JSON content
        with open("cargo_data.js", "r", encoding='utf-8') as f:
            content = f.read()
            # It starts with 'window.CARGO_DATA = '
            json_str = content.split('window.CARGO_DATA = ')[1].strip()
            if json_str.endswith(';'): json_str = json_str[:-1]
            
            data = json.loads(json_str)
            self.assertIn("main_deck", data)
            self.assertIn("lower_deck", data)
            print("✅ Data structure valid.")
            
        print("✅ Full run successful.")

    def test_interactive_input_exists(self):
        print("Testing interactive_input existence...")
        self.assertTrue(hasattr(cargo_calculator, 'interactive_input'), "interactive_input function is missing!")

if __name__ == '__main__':
    unittest.main()
