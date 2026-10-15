import { describe, expect, it } from 'vitest'
import { parseCsvDataset } from '../../core/csv/parseCsv'
import { autoDetectSource } from '../sourceDetection'
import fixture from './__fixtures__/unified-transactions.csv?raw'
import { amazonUnifiedTransactionAdapter } from './unifiedTransactionAdapter'
import { buildOrderCohort, buildCohortFinancials } from '../../core/analytics/orderLifecycle'

const raw = parseCsvDataset(fixture, 'amazon-aug-2026', 'Amazon August 2026.csv')

const india2025Format = `Includes Amazon Marketplace, Fulfillment by Amazon (FBA), and Amazon Webstore transactions
All amounts in INR, unless specified
Definitions:
Date/Time: Posted date/time of the transaction
Note: Reports with start date of 1 Jan 2025 or later include released and deferred transactions.
date/time\tsettlement id\ttype\torder id\tSku\tdescription\tquantity\tproduct sales\tTotal sales tax liable(GST before adjusting TCS)\tTCS-CGST\tTCS-SGST\tTCS-IGST\tTDS (Section 194-O)\tselling fees\tfba fees\tother transaction fees\tother\ttotal\tTransaction Status\tTransaction Release Date
1 Aug 2026 3:44:19 pm UTC\t27630225162\tOrder\t403-1723004-9525953\tAS-ERC6-2EI9\tProduct\t1\t761.86\t137.14\t0\t0\t-3.81\t-0.78\t0\t0\t0\t0\t894.41\tReleased\t11 Aug 2026 7:12:14 am UTC
1 Aug 2026 1:41:32 am UTC\t27586694232\tSAFE-T Reimbursement\t404-8158493-5928360\tTrolly-22x9Inch-PO1-MFN\tSAFE-T Claim ID: 79074\t1\t0\t0\t0\t0\t0\t0\t0\t0\t0\t148.38\t148.38\tReleased\t1 Aug 2026 1:41:32 am UTC
31 Jul 2026 7:17:15 pm UTC\t27545855912\tService Fee\t\t\tCost of Advertising\t\t0\t0\t0\t0\t0\t0\t0\t0\t-2092.98\t-376.74\t-2469.72\tReleased\t31 Jul 2026 7:17:15 pm UTC
1 Aug 2026 8:11:08 am UTC\t27586694232\tTransfer\t\t\tTo account ending with: 297\t\t0\t0\t0\t0\t0\t0\t0\t0\t0\t-21937.71\t-21937.71\tReleased\t1 Aug 2026 8:11:08 am UTC`

const returnFormat = `date/time\tsettlement id\ttype\torder id\tSku\tdescription\tquantity\tproduct sales\tselling fees\tother transaction fees\tother\ttotal\tTransaction Status
1 Aug 2026\t1\tRefund\tRTO-1\tSKU-1\tProduct refund\t1\t-500\t0\t0\t0\t-500\tReleased
1 Aug 2026\t1\tShipping Services\tRTO-1\t\tAmazon Easy Ship Weight Handling Fee Reversal\t\t0\t0\t100\t0\t100\tReleased
1 Aug 2026\t1\tRefund\tRETURN-1\tSKU-2\tProduct refund\t1\t-300\t0\t0\t0\t-300\tReleased`

const previouslyUnclassifiedFormat = `date/time\tsettlement id\ttype\torder id\tSku\tdescription\tquantity\tproduct sales\tTDS (Section 194-O)\tselling fees\tfba fees\tother transaction fees\tother\ttotal\tTransaction Status
27 Feb 2026\t1\tDebt\t\t\tCross-Account Debt Adjustment\t\t0\t0\t0\t0\t0\t377.04\t377.04\tReleased
27 Feb 2026\t1\tDebt\t\t\tCross-Account Debt Adjustment\t\t0\t0\t0\t0\t0\t-377.04\t-377.04\tReleased
6 Jun 2026\t1\tFulfilment Fee Refund\tORDER-1\tSKU-1\tFulfillment Fee Refund\t1\t0\t0\t0\t120.36\t0\t0\t120.36\tReleased
17 Jun 2026\t1\tTax Withheld\t\t\tTDS - Section 194-O\t\t0\t-114.07\t0\t0\t0\t0\t-114.07\tReleased`

describe('Amazon Unified Transaction adapter', () => {
  it('is selected by automatic source detection', () => {
    const detected = autoDetectSource(raw)
    expect(detected?.adapter.id).toBe('amazon-unified-transactions')
    expect(detected?.detection.confidence).toBe(1)
  })

  it('detects a UTF-8 BOM-prefixed Amazon export', () => {
    const withBom = parseCsvDataset(`\uFEFF${fixture}`, 'amazon-bom', 'Amazon BOM.csv')

    expect(autoDetectSource(withBom)?.adapter.id).toBe('amazon-unified-transactions')
  })

  it('imports the post-2025 India tab-separated report after its preamble', () => {
    const indiaRaw = parseCsvDataset(india2025Format, 'amazon-india-2026', 'Amazon India.txt')
    const detected = autoDetectSource(indiaRaw)
    const result = amazonUnifiedTransactionAdapter.normalize(indiaRaw)

    expect(indiaRaw.metadata).toMatchObject({ delimiter: 'tab', skippedPreambleRows: '5' })
    expect(indiaRaw.rows).toHaveLength(4)
    expect(detected?.adapter.id).toBe('amazon-unified-transactions')
    expect(result.events.find((event) => event.amountType === 'PRODUCT_REVENUE')?.status).toBe('Released')
    expect(result.events.filter((event) => event.sourceRow === 1 && event.amountType === 'TAX')).toHaveLength(3)
    expect(result.events.find((event) => event.sourceRow === 2)?.event).toBe('REIMBURSEMENT')
    expect(result.events.find((event) => event.sourceRow === 2)?.sku).toBe('Trolly-22x9Inch-PO1')
    expect(result.events.find((event) => event.sourceRow === 2)?.raw.Sku).toBe('Trolly-22x9Inch-PO1-MFN')
    expect(result.events.find((event) => event.sourceRow === 3)?.event).toBe('FEE')
    expect(result.events.filter((event) => event.sourceRow === 3).every((event) => event.amountType === 'ADVERTISING_FEE')).toBe(true)
    expect(result.events.find((event) => event.sourceRow === 4)).toMatchObject({
      event: 'SETTLEMENT',
      amountClass: 'SETTLEMENT',
    })
    expect(result.quality.unknownTransactionTypes).toEqual([])
    expect(result.quality.reconciliation).toMatchObject({ difference: 0, reconciled: true })
  })

  it('does not select Amazon for an unrelated dataset', () => {
    const unrelated = parseCsvDataset('date,customer,value\n2026-08-01,A,10', 'other', 'other.csv')

    expect(autoDetectSource(unrelated)).toBeNull()
  })

  it('emits multiple signed canonical events from a source row', () => {
    const result = amazonUnifiedTransactionAdapter.normalize(raw)
    const orderEvents = result.events.filter((event) => event.sourceRow === 1)

    expect(orderEvents.length).toBeGreaterThan(1)
    expect(orderEvents.find((event) => event.amountType === 'PRODUCT_REVENUE')?.amount).toBe(1000)
    expect(orderEvents.find((event) => event.amountType === 'COMMISSION')?.amount).toBe(-120)
    expect(orderEvents.reduce((sum, event) => sum + event.amount, 0)).toBe(732)
  })

  it('preserves unknown transaction types, money, and raw fields', () => {
    const result = amazonUnifiedTransactionAdapter.normalize(raw)
    const unknown = result.events.filter((event) => event.sourceRow === 3)

    expect(result.quality.unknownTransactionTypes).toEqual(['Experimental Seller Credit'])
    expect(unknown.every((event) => event.event === 'UNKNOWN' && !event.classified)).toBe(true)
    expect(unknown.reduce((sum, event) => sum + event.amount, 0)).toBe(225)
    expect(unknown[0]?.raw['custom audit field']).toBe('unknown-raw')
  })

  it('tracks transfers separately and reconciles all source money', () => {
    const result = amazonUnifiedTransactionAdapter.normalize(raw)
    const transfer = result.events.find((event) => event.sourceRow === 4)

    expect(transfer).toMatchObject({
      event: 'SETTLEMENT',
      amountClass: 'SETTLEMENT',
      amount: 225,
    })
    expect(result.quality.reconciliation).toEqual({
      supported: true,
      sourceTotal: 450,
      normalizedTotal: 450,
      difference: 0,
      reconciled: true,
    })
  })

  it('surfaces an unmapped difference rather than losing money', () => {
    const changed = {
      ...raw,
      rows: [{ ...raw.rows[0], total: '733' }],
    }
    const result = amazonUnifiedTransactionAdapter.normalize(changed)

    expect(result.events.find((event) => event.amountType === 'UNKNOWN')?.amount).toBe(1)
    expect(result.quality.unclassifiedEventCount).toBe(1)
    expect(result.quality.reconciliation.reconciled).toBe(true)
  })

  it('marks reconciliation unsupported when the source has no total column', () => {
    const withoutTotal = {
      ...raw,
      headers: raw.headers.filter((header) => header !== 'total'),
      rows: raw.rows.map(({ total: _total, ...row }) => row),
    }
    const result = amazonUnifiedTransactionAdapter.normalize(withoutTotal)

    expect(result.quality.reconciliation).toMatchObject({
      supported: false,
      sourceTotal: null,
      difference: null,
      reconciled: false,
    })
  })

  it('classifies refund orders with an Easy Ship fee reversal as RTO', () => {
    const result = amazonUnifiedTransactionAdapter.normalize(parseCsvDataset(returnFormat, 'returns', 'returns.txt'))
    const refunds = result.events.filter((event) => event.event === 'REFUND' && event.amountType === 'PRODUCT_REVENUE')

    expect(refunds.find((event) => event.orderId === 'RTO-1')).toMatchObject({ returnType: 'RTO', returnEvidence: 'Easy Ship handling fee reversal found for this order' })
    expect(refunds.find((event) => event.orderId === 'RETURN-1')).toMatchObject({ returnType: 'CUSTOMER_RETURN', returnEvidence: 'No Easy Ship handling fee reversal found for this order' })
  })

  it('classifies debt transfers, tax withholding, and fulfilment fee refunds', () => {
    const result = amazonUnifiedTransactionAdapter.normalize(parseCsvDataset(previouslyUnclassifiedFormat, 'historical', 'historical.txt'))
    const debt = result.events.filter((event) => event.rawType === 'Debt')
    const tax = result.events.find((event) => event.rawType === 'Tax Withheld')
    const feeRefund = result.events.find((event) => event.rawType === 'Fulfilment Fee Refund')

    expect(debt).toHaveLength(2)
    expect(debt.every((event) => event.event === 'SETTLEMENT' && event.amountClass === 'SETTLEMENT')).toBe(true)
    expect(debt.reduce((sum, event) => sum + event.amount, 0)).toBe(0)
    expect(tax).toMatchObject({ event: 'TAX', amountType: 'TAX', amount: -114.07, classified: true })
    expect(feeRefund).toMatchObject({ event: 'FEE', amountType: 'FULFILLMENT_FEE', amount: 120.36, classified: true })
    expect(result.quality).toMatchObject({ unknownTransactionTypes: [], unclassifiedEventCount: 0 })
    expect(result.quality.reconciliation).toMatchObject({ difference: 0, reconciled: true })
  })

  it('counts fees embedded in source totals once through order selection and final profit', () => {
    const source = `date/time,settlement id,type,order id,sku,description,quantity,product sales,promotional rebates,Total sales tax liable(GST before adjusting TCS),TCS-IGST,TDS (Section 194-O),other transaction fees,other,total,Transaction Status
3 Sept 2026,TEST,Order,TEST-FEE-ONCE,TEST-SKU,Test product,2,1000,-50,180,-5,-1,-160,0,964,Released
3 Sept 2026,TEST,Shipping Services,TEST-FEE-ONCE,,Easy Ship weight handling fees,,0,0,0,0,0,-120,0,-120,Released
3 Sept 2026,TEST,Transfer,,,Test bank transfer,,0,0,0,0,0,0,-844,-844,Released`
    const normalized = amazonUnifiedTransactionAdapter.normalize(parseCsvDataset(source, 'fee-once', 'synthetic.csv'))
    const cohort = buildOrderCohort(normalized.events, { from: '2026-09-01', to: '2026-09-30' })
    const costs = [{ sku: 'TEST-SKU', unitCost: 200, updatedAt: '' }]
    const result = buildCohortFinancials(cohort, costs, 'BLOCK')
    // Direct source-row totals: 964 - 120 = 844. The bank transfer is not an expense.
    expect(normalized.quality.reconciliation).toMatchObject({ sourceTotal: 0, normalizedTotal: 0, difference: 0 })
    expect(result.released).toMatchObject({ grossSales: 1000, marketplaceCharges: 160, netEasyShipFee: 120, operatingNet: 844, netCogs: 400, profit: 444 })
    expect(result.orders[0].released.profit).toBe(444)
    expect(result.released.profit).not.toBe(284) // Would incorrectly deduct the embedded 160 fee twice.
  })

  it('counts a later refund total once and reverses the original resellable inventory cost', () => {
    const source = `date/time,settlement id,type,order id,sku,description,quantity,product sales,promotional rebates,Total sales tax liable(GST before adjusting TCS),TCS-IGST,TDS (Section 194-O),other transaction fees,total,Transaction Status
3 Sept 2026,TEST,Order,TEST-RETURN-ONCE,TEST-SKU,Test product,2,1000,-50,180,-5,-1,-160,964,Released
3 Sept 2026,TEST,Shipping Services,TEST-RETURN-ONCE,,Easy Ship weight handling fees,,0,0,0,0,0,-120,-120,Released
5 Oct 2026,TEST,Refund,TEST-RETURN-ONCE,TEST-SKU,Test product,2,-1000,50,-180,5,1,80,-1044,Released`
    const normalized = amazonUnifiedTransactionAdapter.normalize(parseCsvDataset(source, 'refund-once', 'synthetic-return.csv'))
    const cohort = buildOrderCohort(normalized.events, { from: '2026-09-01', to: '2026-09-30' })
    const result = buildCohortFinancials(cohort, [{ sku: 'TEST-SKU', unitCost: 200, updatedAt: '' }], 'BLOCK')
    // 964 - 120 - 1044 = -200; recovered stock cancels the original 400 COGS.
    expect(normalized.quality.reconciliation).toMatchObject({ sourceTotal: -200, normalizedTotal: -200, difference: 0 })
    expect(result.released).toMatchObject({ grossSales: 1000, refundValue: 1000, marketplaceCharges: 80, operatingNet: -200, netCogs: 0, profit: -200 })
  })

})
