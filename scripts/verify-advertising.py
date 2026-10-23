#!/usr/bin/env python3
"""Independent, read-only XLSX control totals. Uses Python XML/Decimal, not app code.
Writes private evidence only to the caller's chosen output path (use /tmp).
"""
import argparse
import csv
import datetime as dt
from decimal import Decimal
import json
import xml.etree.ElementTree as ET
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--ads', required=True)
parser.add_argument('--unified', required=True)
parser.add_argument('--from-date', required=True)
parser.add_argument('--to-date', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(args.ads) as archive:
    strings = []
    if 'xl/sharedStrings.xml' in archive.namelist():
        strings = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', ns)]
    sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
    rows = []
    for row in sheet.findall('.//s:sheetData/s:row', ns):
        values = {}
        for cell in row.findall('s:c', ns):
            col = ''.join(c for c in cell.attrib['r'] if c.isalpha())
            value = cell.findtext('s:v', default='', namespaces=ns)
            if cell.attrib.get('t') == 's':
                value = strings[int(value)]
            elif cell.attrib.get('t') == 'inlineStr':
                value = ''.join(cell.find('s:is', ns).itertext())
            values[col] = value
        rows.append(values)
headers = rows.pop(0)
records = [{headers[col]: value for col, value in row.items() if col in headers} for row in rows]
fields = {'spend': 'Spend', 'attributedSales': '7 Day Total Sales (₹)', 'sameSkuSales': '7 Day Advertised SKU Sales (₹)', 'otherSkuSales': '7 Day Other SKU Sales (₹)', 'impressions': 'Impressions', 'clicks': 'Clicks', 'orders': '7 Day Total Orders (#)', 'units': '7 Day Total Units (#)'}
def date_key(raw):
    try:
        return (dt.datetime(1899, 12, 30) + dt.timedelta(days=float(raw))).date().isoformat()
    except ValueError:
        for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%b %d, %Y'):
            try:
                return dt.datetime.strptime(raw, fmt).date().isoformat()
            except ValueError:
                pass
        raise ValueError('Unsupported date format in independent verifier')
def numeric(raw):
    return Decimal(str(raw or '0').replace(',', '').replace('₹', '').replace('%', '').strip())
controls = {}
selected_count = 0
for row in records:
    if not args.from_date <= date_key(row['Date']) <= args.to_date:
        continue
    selected_count += 1
    sku = row['Advertised SKU']
    totals = controls.setdefault(sku, {field: Decimal(0) for field in fields})
    for field, column in fields.items():
        totals[field] += numeric(row.get(column, '0'))
# Separately check full-source money; this is not derived from canonical normalization.
with open(args.unified, encoding='utf-8-sig', newline='') as stream:
    source_rows = csv.reader(stream)
    for row in source_rows:
        if 'total' in [cell.strip().lower() for cell in row]:
            total_index = [cell.strip().lower() for cell in row].index('total')
            break
    source_total = sum((numeric(row[total_index]) for row in source_rows if len(row) > total_index), Decimal(0))
all_dates = sorted(date_key(row['Date']) for row in records if row.get('Date'))
result = {'reportFrom': all_dates[0], 'reportTo': all_dates[-1], 'from': args.from_date, 'to': args.to_date, 'selectedRows': selected_count, 'sourceFinancialTotal': float(source_total), 'byAdvertisedSku': {sku: {key: float(value) for key, value in totals.items()} for sku, totals in controls.items()}, 'totals': {key: float(sum((row[key] for row in controls.values()), Decimal(0))) for key in fields}}
with open(args.output, 'w') as output:
    json.dump(result, output, indent=2)
print(f'Independent controls written: {selected_count} selected ads rows; {len(controls)} advertised SKUs. No report records printed.')
