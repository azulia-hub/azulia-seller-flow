import {describe,it,expect,vi} from 'vitest'
import {createReviewTransport} from './transport'
const id='404-7576762-5438731'
describe('review API diagnostics',()=>{
  it('reports the eligibility stage, Amazon error and request ID',async()=>{
    const request=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({errors:[{code:'InvalidInput',message:'Order is not eligible.'}]}),{status:400,headers:{'x-amzn-requestid':'request-123'}}))
    const transport=createReviewTransport({},request,'test-token')
    await expect(transport.eligible(id,new AbortController().signal)).rejects.toThrow('Review eligibility check failed (HTTP 400). InvalidInput: Order is not eligible. Request ID: request-123')
  })
  it('reports submission rejection without forwarding internal attempt headers upstream',async()=>{
    const request=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({errors:[{code:'InvalidInput',message:'Already requested.'}]}),{status:400}))
    const transport=createReviewTransport({},request,'test-token')
    await expect(transport.submit(id,'private-attempt',new AbortController().signal)).rejects.toThrow('Review submission failed (HTTP 400). InvalidInput: Already requested.')
    expect(new Headers(request.mock.calls[0][1]?.headers).has('X-Azulia-Review-Attempt')).toBe(false)
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('retains the bridge dispatch marker only for native-managed requests',async()=>{
    const request=vi.fn<typeof fetch>().mockResolvedValue(new Response('{}',{status:201}))
    await createReviewTransport({},request,'native-managed').submit(id,'native-attempt',new AbortController().signal)
    expect(new Headers(request.mock.calls[0][1]?.headers).get('X-Azulia-Review-Attempt')).toBe('native-attempt')
  })
  it('does not display HTML or unrelated upstream response fields',async()=>{
    const request=vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>upstream debug information</html>',{status:400}))
    await expect(createReviewTransport({},request,'test-token').eligible(id,new AbortController().signal)).rejects.toThrow('Review eligibility check failed (HTTP 400). Amazon returned no structured error explanation.')
  })
})
