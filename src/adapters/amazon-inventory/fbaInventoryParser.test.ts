import { describe, expect, it } from 'vitest'
import {
  parseFbaInventoryPage,
  parseFbaInventorySummary,
} from './fbaInventoryParser'
import type { RawAmazonFbaInventoryResponse } from './types'

describe('Amazon FBA Inventory parser', () => {
  it('parses standard SP-API payload with granular breakdown and nextToken', () => {
    const fixture: RawAmazonFbaInventoryResponse = {
      pagination: {
        nextToken: 'PAGE_TOKEN_ABC_123',
      },
      payload: {
        granularity: {
          granularityType: 'Marketplace',
          granularityId: 'A21TJRUUN4KGV',
        },
        inventorySummaries: [
          {
            asin: 'B08XYZ1234',
            fnSku: 'X001ABCDEF',
            sellerSku: 'SHELF-OAK-01',
            condition: 'NewItem',
            productName: 'Azulia Oak Floating Shelf',
            totalQuantity: 85,
            lastUpdatedTime: '2026-11-13T18:00:00Z',
            inventoryDetails: {
              fulfillableQuantity: 50,
              inboundWorkingQuantity: 5,
              inboundShippedQuantity: 20,
              inboundReceivingQuantity: 10,
              reservedQuantity: {
                totalReservedQuantity: 15,
                pendingCustomerOrderQuantity: 5,
                pendingTransshipmentQuantity: 8,
                fcProcessingQuantity: 2,
              },
              unfulfillableQuantity: {
                totalUnfulfillableQuantity: 2,
                customerDamagedQuantity: 1,
                defectiveQuantity: 1,
                carrierDamagedQuantity: 0,
              },
            },
          },
        ],
      },
    }

    const page = parseFbaInventoryPage(fixture)
    expect(page.items.length).toBe(1)
    expect(page.nextToken).toBe('PAGE_TOKEN_ABC_123')
    expect(page.isComplete).toBe(false)

    const item = page.items[0]
    expect(item.sku).toBe('SHELF-OAK-01')
    expect(item.asin).toBe('B08XYZ1234')
    expect(item.fnSku).toBe('X001ABCDEF')
    expect(item.title).toBe('Azulia Oak Floating Shelf')
    expect(item.condition).toBe('NewItem')

    // Stock quantities
    expect(item.quantities.available).toBe(50)
    expect(item.quantities.reserved).toBe(15)
    expect(item.quantities.reservedBreakdown?.customerOrders).toBe(5)
    expect(item.quantities.reservedBreakdown?.fcTransfers).toBe(8)
    expect(item.quantities.reservedBreakdown?.fcProcessing).toBe(2)

    // Inbound
    expect(item.quantities.inbound).toBe(35) // 5 + 20 + 10
    expect(item.quantities.inboundBreakdown?.working).toBe(5)
    expect(item.quantities.inboundBreakdown?.shipped).toBe(20)
    expect(item.quantities.inboundBreakdown?.receiving).toBe(10)

    // Unsellable
    expect(item.quantities.unsellable).toBe(2)
    expect(item.quantities.unsellableBreakdown?.customerDamaged).toBe(1)
    expect(item.quantities.unsellableBreakdown?.defective).toBe(1)
  })

  it('handles missing inventory details without defaulting to zero', () => {
    const raw = {
      sellerSku: 'SKU-EMPTY',
      asin: 'B000000000',
      inventoryDetails: null, // No details returned by Amazon
    }

    const record = parseFbaInventorySummary(raw)
    expect(record).not.toBeNull()
    expect(record!.sku).toBe('SKU-EMPTY')
    expect(record!.quantities.available).toBeNull() // MUST BE null, not 0!
    expect(record!.quantities.inbound).toBeNull()
    expect(record!.quantities.reserved).toBeNull()
    expect(record!.quantities.unsellable).toBeNull()
  })

  it('parses string quantities safely from JSON', () => {
    const raw = {
      sellerSku: 'SKU-STRINGS',
      inventoryDetails: {
        fulfillableQuantity: '42',
        inboundShippedQuantity: '10',
      },
    }

    const record = parseFbaInventorySummary(raw)
    expect(record).not.toBeNull()
    expect(record!.quantities.available).toBe(42)
    expect(record!.quantities.inbound).toBe(10)
  })

  it('terminates pagination when nextToken is null or absent', () => {
    const fixture = {
      payload: {
        inventorySummaries: [
          { sellerSku: 'SKU-LAST', inventoryDetails: { fulfillableQuantity: 5 } },
        ],
      },
    }

    const page = parseFbaInventoryPage(fixture)
    expect(page.items.length).toBe(1)
    expect(page.nextToken).toBeNull()
    expect(page.isComplete).toBe(true)
  })
})
