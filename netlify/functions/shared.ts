import { handleSharedAccount } from '../../server/shared/handler'
export default (request: Request, context: { ip: string }) => handleSharedAccount(request,process.env,fetch,context.ip)
export const config = { method:['POST','OPTIONS'], rateLimit:{action:'rate_limit',aggregateBy:['ip'],windowSize:60,windowLimit:180} }
