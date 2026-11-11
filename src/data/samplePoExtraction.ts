import type { PoExtractionResponse } from "@/types/poImport";

// Saved output of /api/po-import/extract for public/assets/SickFit October POs .pdf (7 Paradies
// POs, read 2026-11-11). Used by the "Load sample POs" testing button so no API credit is spent.

export const SAMPLE_PO_FILE_NAME = "SAMPLE - SickFit October POs.pdf";

export const SAMPLE_PO_EXTRACTION: PoExtractionResponse = {
  "purchase_orders": [
    {
      "po_number": "4500893609",
      "order_date": "2026-10-02",
      "start_ship_date": "2026-10-09",
      "ship_complete_date": "2026-10-19",
      "buyer_name": "Ashlee McDaniel",
      "payment_terms_raw": "NT30 Net due in 30 days",
      "currency": "USD",
      "bill_to": {
        "company": "The Paradies Shops LLC",
        "street": "2849 Paces Ferry Road SE",
        "city": "ATLANTA",
        "state": "GA",
        "zip": "30339"
      },
      "ship_to": {
        "company": "PARADIES SLC",
        "street": "4752 West California Avenue Bldg. A, Ste. 300",
        "city": "Salt Lake City",
        "state": "UT",
        "zip": "84104",
        "store_code": "9801"
      },
      "additional_ship_to": "W033 (9801)",
      "lines": [
        {
          "line_number": "10",
          "retailer_item_number": "1253646",
          "vendor_style": "CRW-P01-LTD-UTH-BRWN",
          "description": "SF UTAH BROWN SOCKS",
          "upc": "850065635873",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        },
        {
          "line_number": "20",
          "retailer_item_number": "1253638",
          "vendor_style": "CRW-P01-LTD-UTH-CRE",
          "description": "SF UTAH CREAM SOCKS",
          "upc": "850065635866",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        },
        {
          "line_number": "30",
          "retailer_item_number": "1253641",
          "vendor_style": "CRW-P02-LTD-BCA",
          "description": "SF 2PACK BREAST CANCER SOCKS",
          "upc": "850065635392",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 14,
          "unit_retail": 35
        }
      ],
      "total_cost": 720,
      "total_retail": 1800
    },
    {
      "po_number": "4500893610",
      "order_date": "2026-10-02",
      "start_ship_date": "2026-10-09",
      "ship_complete_date": "2026-10-19",
      "buyer_name": "Ashlee McDaniel",
      "payment_terms_raw": "NT30 Net due in 30 days",
      "currency": "USD",
      "bill_to": {
        "company": "The Paradies Shops LLC",
        "street": "2849 Paces Ferry Road SE",
        "city": "ATLANTA",
        "state": "GA",
        "zip": "30339"
      },
      "ship_to": {
        "company": "PARADIES ATL",
        "street": "5290 WESTGATE DRIVE SW Suite D",
        "city": "ATLANTA",
        "state": "GA",
        "zip": "30336",
        "store_code": "9770"
      },
      "additional_ship_to": "W004 (9770)",
      "lines": [
        {
          "line_number": "20",
          "retailer_item_number": "1253641",
          "vendor_style": "CRW-P02-LTD-BCA",
          "description": "SF 2PACK BREAST CANCER SOCKS",
          "upc": "850065635392",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 14,
          "unit_retail": 35
        },
        {
          "line_number": "10",
          "retailer_item_number": "1253639",
          "vendor_style": "CRW-P01-LTD-ATL-WHT",
          "description": "SF ATL WHITE SOCKS",
          "upc": "850065635194",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        }
      ],
      "total_cost": 528,
      "total_retail": 1320
    },
    {
      "po_number": "4500894138",
      "order_date": "2026-10-05",
      "start_ship_date": "2026-10-09",
      "ship_complete_date": "2026-10-19",
      "buyer_name": "Ashlee McDaniel",
      "payment_terms_raw": "NT30 Net due in 30 days",
      "currency": "USD",
      "bill_to": {
        "company": "The Paradies Shops LLC",
        "street": "2849 Paces Ferry Road SE",
        "city": "ATLANTA",
        "state": "GA",
        "zip": "30339"
      },
      "ship_to": {
        "company": "Paradies AUS",
        "street": "384 COMMERCIAL DRIVE 1",
        "city": "BUDA",
        "state": "TX",
        "zip": "78610",
        "store_code": "9512"
      },
      "additional_ship_to": "W088 (9512)",
      "lines": [
        {
          "line_number": "30",
          "retailer_item_number": "1253640",
          "vendor_style": "CRW-P01-LTD-TX-PNK",
          "description": "SF TEXAS PINK SOCKS",
          "upc": "850065635187",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        },
        {
          "line_number": "20",
          "retailer_item_number": "1215970",
          "vendor_style": "TEXAS GREY SOCKS",
          "description": "Texas Grey Socks",
          "upc": "850065635132",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        },
        {
          "line_number": "10",
          "retailer_item_number": "1215969",
          "vendor_style": "Texas Creme Socks",
          "description": "Texas Creme Socks",
          "upc": "850065635026",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        }
      ],
      "total_cost": 576,
      "total_retail": 1440
    },
    {
      "po_number": "4500894139",
      "order_date": "2026-10-05",
      "start_ship_date": "2026-10-09",
      "ship_complete_date": "2026-10-19",
      "buyer_name": "Ashlee McDaniel",
      "payment_terms_raw": "NT30 Net due in 30 days",
      "currency": "USD",
      "bill_to": {
        "company": "The Paradies Shops LLC",
        "street": "2849 Paces Ferry Road SE",
        "city": "ATLANTA",
        "state": "GA",
        "zip": "30339"
      },
      "ship_to": {
        "company": "Paradies IAH",
        "street": "18442 SECURITY BLDG. 10 SUITE 500",
        "city": "HOUSTON",
        "state": "TX",
        "zip": "77032",
        "store_code": "9281"
      },
      "additional_ship_to": "W042 (9281)",
      "lines": [
        {
          "line_number": "30",
          "retailer_item_number": "1253640",
          "vendor_style": "CRW-P01-LTD-TX-PNK",
          "description": "SF TEXAS PINK SOCKS",
          "upc": "850065635187",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        },
        {
          "line_number": "20",
          "retailer_item_number": "1215970",
          "vendor_style": "TEXAS GREY SOCKS",
          "description": "Texas Grey Socks",
          "upc": "850065635132",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        },
        {
          "line_number": "10",
          "retailer_item_number": "1215969",
          "vendor_style": "Texas Creme Socks",
          "description": "Texas Creme Socks",
          "upc": "850065635026",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        }
      ],
      "total_cost": 576,
      "total_retail": 1440
    },
    {
      "po_number": "4500894140",
      "order_date": "2026-10-05",
      "start_ship_date": "2026-10-09",
      "ship_complete_date": "2026-10-19",
      "buyer_name": "Ashlee McDaniel",
      "payment_terms_raw": "NT30 Net due in 30 days",
      "currency": "USD",
      "bill_to": {
        "company": "The Paradies Shops LLC",
        "street": "2849 Paces Ferry Road SE",
        "city": "ATLANTA",
        "state": "GA",
        "zip": "30339"
      },
      "ship_to": {
        "company": "Paradies HOU",
        "street": "5927 SOUTH LOOP EAST",
        "city": "HOUSTON",
        "state": "TX",
        "zip": "77033",
        "store_code": "9832"
      },
      "additional_ship_to": "W037 (9832)",
      "lines": [
        {
          "line_number": "30",
          "retailer_item_number": "1253640",
          "vendor_style": "CRW-P01-LTD-TX-PNK",
          "description": "SF TEXAS PINK SOCKS",
          "upc": "850065635187",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        },
        {
          "line_number": "20",
          "retailer_item_number": "1215970",
          "vendor_style": "TEXAS GREY SOCKS",
          "description": "Texas Grey Socks",
          "upc": "850065635132",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        },
        {
          "line_number": "10",
          "retailer_item_number": "1215969",
          "vendor_style": "Texas Creme Socks",
          "description": "Texas Creme Socks",
          "upc": "850065635026",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        }
      ],
      "total_cost": 576,
      "total_retail": 1440
    },
    {
      "po_number": "4500894141",
      "order_date": "2026-10-05",
      "start_ship_date": "2026-10-09",
      "ship_complete_date": "2026-10-19",
      "buyer_name": "Ashlee McDaniel",
      "payment_terms_raw": "NT30 Net due in 30 days",
      "currency": "USD",
      "bill_to": {
        "company": "The Paradies Shops LLC",
        "street": "2849 Paces Ferry Road SE",
        "city": "ATLANTA",
        "state": "GA",
        "zip": "30339"
      },
      "ship_to": {
        "company": "Paradies SAT",
        "street": "10000 JOHN SAUNDERS BAY 41",
        "city": "SAN ANTONIO",
        "state": "TX",
        "zip": "78216",
        "store_code": "9225"
      },
      "additional_ship_to": "W016 (9225)",
      "lines": [
        {
          "line_number": "30",
          "retailer_item_number": "1253640",
          "vendor_style": "CRW-P01-LTD-TX-PNK",
          "description": "SF TEXAS PINK SOCKS",
          "upc": "850065635187",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        },
        {
          "line_number": "20",
          "retailer_item_number": "1215970",
          "vendor_style": "TEXAS GREY SOCKS",
          "description": "Texas Grey Socks",
          "upc": "850065635132",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        },
        {
          "line_number": "10",
          "retailer_item_number": "1215969",
          "vendor_style": "Texas Creme Socks",
          "description": "Texas Creme Socks",
          "upc": "850065635026",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        }
      ],
      "total_cost": 576,
      "total_retail": 1440
    },
    {
      "po_number": "4500895703",
      "order_date": "2026-10-09",
      "start_ship_date": "2026-10-16",
      "ship_complete_date": "2026-10-26",
      "buyer_name": "Ashlee McDaniel",
      "payment_terms_raw": "NT30 Net due in 30 days",
      "currency": "USD",
      "bill_to": {
        "company": "The Paradies Shops LLC",
        "street": "2849 Paces Ferry Road SE",
        "city": "ATLANTA",
        "state": "GA",
        "zip": "30339"
      },
      "ship_to": {
        "company": "PARADIES DFW",
        "street": "2417 North Support Rd STE C-120, BAY B",
        "city": "Dallas",
        "state": "TX",
        "zip": "75261",
        "store_code": "9031"
      },
      "additional_ship_to": "W001 (9031)",
      "lines": [
        {
          "line_number": "20",
          "retailer_item_number": "1253641",
          "vendor_style": "CRW-P02-LTD-BCA",
          "description": "SF 2PACK BREAST CANCER SOCKS",
          "upc": "850065635392",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 14,
          "unit_retail": 35
        },
        {
          "line_number": "10",
          "retailer_item_number": "1253640",
          "vendor_style": "CRW-P01-LTD-TX-PNK",
          "description": "SF TEXAS PINK SOCKS",
          "upc": "850065635187",
          "quantity": 24,
          "unit": "EA/1",
          "unit_cost": 8,
          "unit_retail": 20
        }
      ],
      "total_cost": 528,
      "total_retail": 1320
    }
  ]
};
