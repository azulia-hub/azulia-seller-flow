import { handleAmazonRelay } from '../../server/relay/handler'
export default (request: Request) => handleAmazonRelay(request)
export const config = { method: 'POST', rateLimit: { action: 'rate_limit', aggregateBy: ['ip'], windowSize: 60, windowLimit: 90 } }
