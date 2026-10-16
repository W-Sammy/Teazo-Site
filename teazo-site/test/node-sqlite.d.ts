// Types for the parts of Node's built-in SQLite that test/sqlite-d1.ts uses.
// The project's @types/node (v20) predates node:sqlite, which Node 22.13+ and 24 ship.
declare module "node:sqlite" {
  type SqlValue = string | number | bigint | null | Uint8Array;

  export class StatementSync {
    all(...params: SqlValue[]): Record<string, unknown>[];
    get(...params: SqlValue[]): Record<string, unknown> | undefined;
    run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
