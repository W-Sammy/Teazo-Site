import "server-only";
import { resolveSquareEnvironment, type SquareEnvironmentName } from "./square-environment";

export type { SquareEnvironmentName } from "./square-environment";

/** Shared by the Square API client and database records keyed by environment. */
export function getSquareEnvironment(): SquareEnvironmentName {
  return resolveSquareEnvironment(process.env.SQUARE_ENVIRONMENT);
}
