const hosts=new Set(['m.media-amazon.com','images.amazon.com','images-na.ssl-images-amazon.com','images-eu.ssl-images-amazon.com','images-fe.ssl-images-amazon.com'])
export function retainedImageUrl(value:string):string|null {
  try {const url=new URL(value);return url.protocol==='https:' && !url.username && !url.password && !url.port && hosts.has(url.hostname)?url.href:null}catch{return null}
}
