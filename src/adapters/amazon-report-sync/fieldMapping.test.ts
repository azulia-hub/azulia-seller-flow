import { expect, it } from 'vitest'
import { reportColumn } from './fieldMapping'
it('recognizes the observed product, promotion and shipping revenue labels', () => {
  expect(reportColumn('shipment', ['ProductCharges', 'OurPricePrincipal']).column).toBe('product sales')
  expect(reportColumn('shipment', ['Shipping', 'ShippingPrincipal']).column).toBe('shipping credits')
  expect(reportColumn('shipment', ['PromoRebates', 'OurPriceDiscount']).column).toBe('promotional rebates')
  expect(reportColumn('shipment', ['PromoRebates', 'ShippingDiscount']).column).toBe('promotional rebates')
})
it('keeps sale tax, discount tax, TCS and TDS in their existing report columns', () => {
  expect(reportColumn('shipment', ['Tax', 'OurPriceTax']).column).toBe('product sales tax')
  expect(reportColumn('shipment', ['Tax', 'OurPriceTaxDiscount']).column).toBe('promotional rebates tax')
  expect(reportColumn('shipment', ['TaxCollectedAtSource', 'TCS-CGST']).column).toBe('TCS-CGST')
  expect(reportColumn('shipment', ['TaxCollectedAtSource', 'TCS-SGST']).column).toBe('TCS-SGST')
  expect(reportColumn('shipment', ['TaxCollectedAtSource', 'TCS-IGST']).column).toBe('TCS-IGST')
  expect(reportColumn('shipment', ['TaxWithholding', 'ItemTDS']).column).toBe('TDS (Section 194-O)')
})
it('includes actual billed fee tax in the matching charge without estimating a rate', () => {
  expect(reportColumn('shipment', ['AmazonFees', 'Commission', 'Base']).column).toBe('selling fees')
  expect(reportColumn('shipment', ['AmazonFees', 'Commission', 'Tax']).column).toBe('selling fees')
  expect(reportColumn('shipment', ['AmazonFees', 'FBAPerUnitFulfillmentFee', 'Tax']).column).toBe('fba fees')
  expect(reportColumn('servicefee', ['FBAFees', 'StorageBillingFee', 'FBAStorageFee', 'Tax']).column).toBe('other transaction fees')
})
it('recognizes advertising and explicit recoveries without treating all adjustments as reimbursements', () => {
  expect(reportColumn('productadspayment', ['Base']).description).toContain('Advertising')
  expect(reportColumn('productadspayment', ['Tax']).description).toContain('Advertising')
  expect(reportColumn('adjustment', ['Sales', 'SAFETReimbursement']).type).toBe('SAFE-T Reimbursement')
  expect(reportColumn('adjustment', ['Expenses']).type).toBe('Service Fee')
  expect(reportColumn('adjustment', ['Sales']).column).toBeNull()
})
it('does not invent Easy Ship identity for generic postage, or classify unknown fee types', () => {
  const postage = reportColumn('servicefee', ['AmazonFees', 'MFNPostageFee', 'Base'])
  expect(postage.column).toBe('other transaction fees')
  expect(postage.description).not.toContain('Easy Ship')
  expect(postage.note).toContain('does not confirm')
  expect(reportColumn('shipment', ['AmazonFees', 'FutureFee', 'Base']).column).toBeNull()
})
it('keeps bank and cross-account movements in the settlement type', () => {
  expect(reportColumn('transfer', ['Sales', 'FundTransfer']).type).toBe('Transfer')
  expect(reportColumn('adjustment', ['Expenses', 'CrossAccountDebtAdjustment']).type).toBe('Transfer')
})
it('matches verified India CSV closing charges and configured Easy Ship postage', () => {
  expect(reportColumn('shipment', ['AmazonFees', 'FixedClosingFee', 'Base']).column).toBe('other transaction fees')
  expect(reportColumn('shipment', ['AmazonFees', 'FixedClosingFee', 'Tax']).column).toBe('other transaction fees')
  expect(reportColumn('servicefee', ['AmazonFees', 'MFNPostageFee', 'Base'], { mfnPostageIsEasyShip: true }).description).toContain('Easy Ship')
  expect(reportColumn('servicefee', ['AmazonFees', 'MFNPostageFee', 'Tax'], { mfnPostageIsEasyShip: true }).description).toContain('Easy Ship')
})
it('matches CSV Easy Ship reversals and FBA shipping chargebacks without guessing unnamed refunds', () => {
  expect(reportColumn('servicefee', ['Sales', 'AmazonFees'], { sourceDescription: 'EasyshipFulfillmentFeeRefund' }).description).toContain('Easy Ship reversal')
  expect(reportColumn('servicefee', ['Sales', 'AmazonFees']).description).not.toContain('Easy Ship')
  expect(reportColumn('shipment', ['AmazonFees', 'ShippingChargeback', 'Base']).column).toBe('fba fees')
  expect(reportColumn('refund', ['AmazonFees', 'ShippingChargeback', 'Tax']).column).toBe('fba fees')
})
it('includes delivery-service components in verified India Easy Ship charges', () => {
  expect(reportColumn('servicefee', ['AmazonFees', 'MFNDeliveryServiceFee', 'Tax'], { mfnPostageIsEasyShip: true }).description).toContain('Easy Ship')
  expect(reportColumn('servicefee', ['AmazonFees', 'MFNDeliveryServiceFee', 'Tax']).description).not.toContain('Easy Ship')
})
it('preserves the CSV categories of known account adjustments and inbound pickup charges', () => {
  expect(reportColumn('miscellaneousledgeradjustment', ['Other'], { sourceDescription: 'ESUndeliverableFee' })).toMatchObject({ column: 'other', type: 'Adjustment' })
  expect(reportColumn('miscellaneousledgeradjustment', ['Other'], { sourceDescription: 'FBAReverseMerchantCommissionForARefund' })).toMatchObject({ column: 'other', type: 'Adjustment' })
  expect(reportColumn('miscellaneousledgeradjustment', ['Other'], { sourceDescription: 'FutureAdjustment' }).column).toBeNull()
  expect(reportColumn('servicefee', ['AmazonFees', 'FBAInboundTransportationFee', 'Base']).column).toBe('other')
})
