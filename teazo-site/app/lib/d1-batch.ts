type Statement = { sql: string; params: unknown[] };

/** Shared by transport and preflight validation so both measure the same body. */
export function getD1BatchBody(statements: Array<{ toStmt(): Statement }>) {
  return { statements: statements.map((statement) => statement.toStmt()) };
}
