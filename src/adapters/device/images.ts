import { androidDevice,desktopDevice,nativeRequest } from './bridge'
import { retainedImageUrl } from './imagePolicy'
export { retainedImageUrl } from './imagePolicy'
export async function deviceImageUrl(value:string):Promise<string> {
  const url=retainedImageUrl(value)
  if(!url)return value
  if(androidDevice)return (await nativeRequest<{url:string}>('image.get',{url})).url
  return desktopDevice?`/api/device/image?url=${encodeURIComponent(url)}`:value
}
