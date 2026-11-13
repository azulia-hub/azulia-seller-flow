import type { PilotCredentials } from './authorization.ts'
import { object, text } from '../amazon-report-sync/money.ts'
import { SourceError, sourceAccessToken } from './reader.ts'
export function createCatalogReader(credentials: PilotCredentials, request: typeof fetch = fetch, sessionToken?: string) {
  let token = sessionToken ?? '', until = sessionToken ? Infinity : 0
  return async (asin: string, signal: AbortSignal) => {
    if (!/^[A-Z0-9]{10}$/.test(asin)) throw new SourceError('Unsupported catalog identifier.', 86400, 400)
    if (!token || Date.now() >= until) { token = await sourceAccessToken(credentials, request); until = Date.now() + 45 * 60000 }
    const url = new URL(`https://sellingpartnerapi-eu.amazon.com/catalog/2022-04-01/items/${asin}`)
    url.search = new URLSearchParams({ marketplaceIds: 'A21TJRUUN4KGV', includedData: 'images,summaries', locale: 'en_IN' }).toString()
    const response = await request(url, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), headers: { 'x-amz-access-token': token, 'User-Agent': 'Azulia/0.1' } })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 401) { token = ''; until = 0 }
      throw new SourceError(response.status === 403 ? 'Product images need Product Listing access in Amazon. Titles and financial data remain available.' : 'Product images could not be updated. Saved images remain available.', response.status === 403 ? 3600 : 60, response.status)
    }
    const reader = response.body?.getReader(); if (!reader) throw new SourceError('Amazon returned no catalog metadata.')
    const chunks: Uint8Array[] = []; let length = 0
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.byteLength; if (length > 2 * 1024 * 1024) throw new SourceError('Catalog metadata exceeds the local limit.'); chunks.push(chunk.value) } } finally { await reader.cancel() }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const body = object(JSON.parse(new TextDecoder().decode(bytes)))
    if (body.asin !== asin) throw new SourceError('Catalog item identity did not match the requested product.')
    const groups = Array.isArray(body.images) ? body.images.map(object) : []
    const group = groups.find(row => row.marketplaceId === 'A21TJRUUN4KGV') ?? groups[0]
    const allImages = Array.isArray(group?.images) ? group.images.map(object) : []
    const mainImages = allImages.filter(row => row.variant === 'MAIN').sort((a, b) => Number(a.width) - Number(b.width))
    const images = mainImages.length ? mainImages : allImages.sort((a, b) => Number(a.width) - Number(b.width))
    const image = images.find(row => Number(row.width) >= 100) ?? images.at(-1)
    let imageUrl: string | null = null
    try { const candidate = new URL(text(image?.link)); if (candidate.protocol === 'https:' && !candidate.username && !candidate.password) imageUrl = candidate.href } catch { /* Missing image stays explicit. */ }
    const summaries = Array.isArray(body.summaries) ? body.summaries.map(object) : []
    const summary = summaries.find(row => row.marketplaceId === 'A21TJRUUN4KGV') ?? summaries[0]
    return { asin, title: text(summary?.itemName) || null, imageUrl }
  }
}
