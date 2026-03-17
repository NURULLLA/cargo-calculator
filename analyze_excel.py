import openpyxl
import json
import sys

def analyze_excel(file_path):
    try:
        wb = openpyxl.load_workbook(file_path, data_only=True)
        sheet = wb.active
        
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            print("Sheet is empty")
            return

        headers = rows[0]
        sample_data = rows[1:10] if len(rows) > 1 else None
        
        result = {
            "headers": headers,
            "sample_rows": sample_data,
            "row_count": len(rows)
        }
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    analyze_excel(sys.argv[1])
