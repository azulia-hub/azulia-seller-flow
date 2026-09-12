import type { RawDataset, RawRow } from './types'

export interface CreateRawDatasetInput {
  readonly id: string
  readonly name: string
  readonly rows: readonly RawRow[]
  readonly headers?: readonly string[]
  readonly metadata?: Readonly<Record<string, string>>
}

export function createRawDataset(input: CreateRawDatasetInput): RawDataset {
  const inferredHeaders = input.rows.flatMap((row) => Object.keys(row))
  const headers = input.headers ?? [...new Set(inferredHeaders)]

  return {
    id: input.id,
    name: input.name,
    headers: [...headers],
    rows: input.rows.map((row) => ({ ...row })),
    metadata: input.metadata ? { ...input.metadata } : undefined,
  }
}
