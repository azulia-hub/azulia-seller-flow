import type { CanonicalDataset, RawDataset } from '../data/types'
import type { MappingSpec } from '../normalize/types'

export interface DetectionResult {
  readonly matched: boolean
  readonly confidence: number
  readonly reasons: readonly string[]
}

export interface SourceAdapter {
  readonly id: string
  readonly name: string
  detect(input: RawDataset): DetectionResult
  readonly mapping: MappingSpec
  normalize(input: RawDataset, mapping?: MappingSpec): CanonicalDataset
}

export interface DetectedSource {
  readonly adapter: SourceAdapter
  readonly detection: DetectionResult
}

export function detectSource(
  input: RawDataset,
  adapters: readonly SourceAdapter[],
): DetectedSource | null {
  const candidates = adapters
    .map((adapter) => ({ adapter, detection: adapter.detect(input) }))
    .filter((candidate) => candidate.detection.matched)
    .sort((left, right) => right.detection.confidence - left.detection.confidence)

  return candidates[0] ?? null
}
