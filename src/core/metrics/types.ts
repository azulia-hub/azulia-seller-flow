export type Format = 'currency' | 'number' | 'percent' | 'ratio'

export type MetricDefinition =
  | {
      id: string
      name: string
      kind: 'aggregate'
      field: string
      aggregation: 'sum' | 'sumAbs' | 'count' | 'avg'
      filter?: { field: string; operator: '=' | 'contains'; value: string }
      format: Format
    }
  | {
      id: string
      name: string
      kind: 'formula'
      left: string
      operator: '+' | '-' | '*' | '/'
      right: string
      multiplier?: number
      format: Format
    }
