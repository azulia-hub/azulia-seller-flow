export type Rect = [number, number, number, number]
export interface Word { rect: Rect; text: string }
export interface Product { name: string; quantity: number }
export interface PackingRow { product: string; quantity: number; parcels: number }
export interface LabelSummary { file: string; page: number; half: 'top' | 'bottom'; products: Product[] }
export interface CutterInput { name: string; bytes: ArrayBuffer }
export interface CutterOptions { packingList: boolean }
export interface CutterFonts { normal: ArrayBuffer; bold: ArrayBuffer }
export interface CutterResult {
  pdf: Uint8Array<ArrayBuffer>
  packingPdf?: Uint8Array<ArrayBuffer>
  packingCsv?: string
  labels: number
  units: number
  pages: number
  sources: { name: string; labels: number }[]
  products: PackingRow[]
}
export type CutterMessage = { type: 'progress'; message: string } | { type: 'done'; result: CutterResult } | { type: 'error'; message: string }
