import { useMemo, useState } from 'react'
import { summarizeOrderGeography, type GeographyLevel, type SkuProfitSummary } from '../core/analytics/orderProfit'

type Props = { readonly product: SkuProfitSummary; readonly formatMoney: (value: number) => string }
const percent = (value: number) => `${value.toFixed(2)}%`

export function SkuGeographyPanel({ product, formatMoney }: Props) {
  const [level, setLevel] = useState<GeographyLevel>('STATE')
  const geography = useMemo(() => summarizeOrderGeography(product.orders, level), [product, level])
  const locationMax = Math.max(1, ...geography.flatMap(item => [Math.abs(item.grossSales), Math.abs(item.profit), Math.abs(item.easyShipFees)]))

  return <section className="sku-geography"><div className="section-label"><span>Geographic performance</span><div className="segment-control"><button className={level === 'STATE' ? 'active' : ''} onClick={() => setLevel('STATE')}>State</button><button className={level === 'CITY' ? 'active' : ''} onClick={() => setLevel('CITY')}>City</button></div></div><div className="location-visuals ranking-only"><div className="location-ranking">{geography.slice(0,8).map(row => <div key={row.location}><span>{row.location}</span><i><b style={{ width: `${Math.abs(row.profit) / locationMax * 100}%` }} /></i><strong>{formatMoney(row.profit)}</strong></div>)}</div></div><div className="table-scroll"><table><thead><tr><th>{level === 'STATE' ? 'State' : 'City'}</th><th>Orders</th><th>Sales</th><th>Units</th><th>ASP</th><th>RTO</th><th>Customer returns</th><th>Return rate</th><th>Easy Ship</th><th>Marketplace</th><th>COGS</th><th>Ads</th><th>Reimbursements</th><th>Profit</th><th>Margin</th></tr></thead><tbody>{geography.map(row => <tr key={row.location}><td><strong>{row.location}</strong></td><td>{row.orderCount}</td><td>{formatMoney(row.grossSales)}</td><td>{row.soldQuantity}</td><td>{formatMoney(row.averageSellingPrice)}</td><td>{row.rtoQuantity}</td><td>{row.customerReturnQuantity}</td><td>{percent(row.returnRate)}</td><td>{formatMoney(row.easyShipFees)}</td><td>{formatMoney(row.marketplaceCharges)}</td><td>{formatMoney(row.netCogs)}</td><td>{formatMoney(row.advertising)}</td><td>{formatMoney(row.reimbursements)}</td><td className={row.profit < 0 ? 'bad-text' : 'good-text'}>{formatMoney(row.profit)}</td><td>{percent(row.profitMargin)}</td></tr>)}</tbody></table></div></section>
}
