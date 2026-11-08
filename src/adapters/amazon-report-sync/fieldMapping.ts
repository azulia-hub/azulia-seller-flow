/** Source-label translation only. No profit formulas, tax rates or inferred shipping methods. */
export interface ReportColumn { column: string | null; description: string; type?: string; note?: string }
export interface ReportMappingOptions { mfnPostageIsEasyShip?: boolean; sourceDescription?: string }
const code = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const sellingFees = new Set(['commission','referralfee','refundcommission'])
const fulfillmentFees = new Set(['shippingchargeback','fbaperunitfulfillmentfee','fbaweightbasedfee','fbapickandpackfee','fbafulfillmentfee'])
const otherFees = new Set(['closingfee','fixedclosingfee','variableclosingfee','mfnpostagefee','mfndeliveryservicefee','fbastoragefee','storagebillingfee','fbaremovalfee','ordercancellationcharge'])
export function reportColumn(kind: string, path: readonly string[], options: ReportMappingOptions = {}): ReportColumn {
  const names = path.map(code), leaf = names.at(-1) ?? '', parent = names.at(-2) ?? '', description = path.join(' / ')
  const mapped = (column: string, extra: Partial<ReportColumn> = {}): ReportColumn => ({ column, description, ...extra })
  const base = ['principal','principle','base'].includes(leaf), tax = leaf === 'tax'
  if (kind === 'miscellaneousledgeradjustment' && ['esundeliverablefee','fbareversemerchantcommissionforarefund'].includes(code(options.sourceDescription ?? '')) && leaf === 'other') return mapped('other', { type: 'Adjustment', description: `${options.sourceDescription} · ${description}` })
  if ((kind === 'productadspayment' && ['base','tax','principal'].includes(leaf)) || names.some(name => ['costofadvertising','advertisingfee','productadspayment'].includes(name))) return mapped('other transaction fees', { description: `Advertising · ${description}` })
  if (kind === 'servicefee' && code(options.sourceDescription ?? '') === 'easyshipfulfillmentfeerefund' && leaf === 'amazonfees') return mapped('other transaction fees', { description: `Easy Ship reversal · ${description}` })
  if (names.some(name => name.startsWith('easyship'))) return mapped('other transaction fees', { description: `Easy Ship · ${description}` })
  if (options.mfnPostageIsEasyShip && names.some(name => ['mfnpostagefee','mfndeliveryservicefee'].includes(name))) return mapped('other transaction fees', { description: `Easy Ship · ${description}` })
  if (names.some(name => sellingFees.has(name))) return mapped('selling fees')
  if (names.some(name => fulfillmentFees.has(name))) return mapped('fba fees')
  if (names.includes('fbainboundtransportationfee')) return mapped('other')
  if (names.some(name => otherFees.has(name))) return mapped('other transaction fees', names.includes('mfnpostagefee') ? { note: 'MFN postage is included in marketplace charges. Its name alone does not confirm Easy Ship or RTO.' } : {})
  if ((leaf === 'itemtds' && names.includes('taxwithholding')) || ['tds','tdssection194o'].includes(leaf)) return mapped('TDS (Section 194-O)')
  if (names.includes('taxcollectedatsource')) {
    if (leaf === 'tcscgst') return mapped('TCS-CGST')
    if (leaf === 'tcssgst') return mapped('TCS-SGST')
    if (leaf === 'tcsigst') return mapped('TCS-IGST')
  }
  if (['ourpricetaxdiscount','shippingtaxdiscount','promotionalrebatestax'].includes(leaf)) return mapped('promotional rebates tax')
  if ((leaf === 'ourpricetax' && names.includes('tax')) || leaf === 'producttax') return mapped('product sales tax')
  if (leaf === 'shippingtax') return mapped('shipping credits tax')
  if (leaf === 'giftwraptax') return mapped('gift wrap credits tax')
  if (['productcharges','productrevenue'].includes(leaf) || (base || leaf === 'ourpriceprincipal') && ['productcharges','productrevenue'].includes(parent)) return mapped('product sales')
  if (['shipping','shippingcharge','shippingcharges'].includes(leaf) || (base || leaf === 'shippingprincipal') && ['shipping','shippingcharge','shippingcharges'].includes(parent)) return mapped('shipping credits')
  if (['promotion','promotionalrebate','promotionaldiscount','promorebates'].includes(leaf) || names.includes('promorebates') && ['ourpricediscount','shippingdiscount'].includes(leaf)) return mapped('promotional rebates')
  if (['reimbursements','reimbursement','fbainventoryreimbursement','safetreimbursement'].includes(leaf)) return mapped('other', { type: leaf === 'safetreimbursement' ? 'SAFE-T Reimbursement' : 'Reimbursements' })
  if (leaf === 'fundtransfer' || leaf === 'crossaccountdebtadjustment') return mapped('other', { type: 'Transfer' })
  if (kind === 'transfer' || kind === 'disbursement' || kind === 'settlement') return mapped('other')
  if (leaf === 'expenses') return mapped('other transaction fees', { type: 'Service Fee' })
  if (leaf === 'amazonfees' && ['sales','expenses'].includes(parent)) return mapped('other transaction fees', { type: 'Service Fee' })
  if (kind === 'servicefee' && names.length === 1 && (base || tax)) return mapped('other transaction fees')
  return { column: null, description }
}
