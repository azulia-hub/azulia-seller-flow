export interface ReadingInfo { revision:number;calculatedAt:string|null;calculationKey?:string;version?:number }
export function readingInfo(value:unknown):ReadingInfo|null {
  if(!value||typeof value!=='object')return null
  const row=value as {revision?:number;importedAt?:string;precomputed?:{key?:string}}
  if(!Number.isSafeInteger(row.revision)||row.revision!<0)return null
  return {revision:row.revision!,calculatedAt:typeof row.importedAt==='string'?row.importedAt:null,calculationKey:row.precomputed?.key}
}
