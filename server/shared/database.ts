import { getDatabase } from '@netlify/database'

/** Server-only boundary. Statements are fixed SQL; values always use placeholders. */
export interface SharedDatabase {
  query<Row extends object = Record<string, unknown>>(statement: string, parameters?: unknown[]): Promise<Row[]>
}

export function netlifyDatabase(): SharedDatabase {
  let driver: ReturnType<typeof getDatabase> | undefined
  return {
    async query<Row extends object>(statement: string, parameters: unknown[] = []): Promise<Row[]> {
      // Netlify selects the production/preview branch. Do not hard-code its URL.
      driver ??= getDatabase({ debug: false })
      return await driver.sql.unsafe(statement, parameters, { rowMode: 'object' }) as Row[]
    },
  }
}
