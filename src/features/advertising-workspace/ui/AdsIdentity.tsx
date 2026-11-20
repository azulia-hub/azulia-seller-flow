import { ProductThumbnail } from '../../../components/ProductThumbnail'
export function AdsIdentity({ name, imageUrl, asin }: { name: string; imageUrl?: string | null; asin?: string | null }) {
  return <span className="adsw-identity">{imageUrl || asin ? <ProductThumbnail url={imageUrl ?? null} /> : null}<span className="adsw-identity-text" title={name}>{name}{asin && name !== asin ? <small>{asin}</small> : null}</span></span>
}
