import { useState, useEffect } from 'react'
export function ProductThumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [url])
  return <span className="product-thumbnail" aria-hidden="true">{url && !failed ? <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span title="Product image not available">▧</span>}</span>
}
