import "server-only";

export type SquareEnvironmentName = "sandbox" | "production";

/** Shared by the Square API client and database records keyed by environment. */
export function getSquareEnvironment(): SquareEnvironmentName {
  const environment = process.env.SQUARE_ENVIRONMENT?.trim() || "sandbox";
  if (environment !== "sandbox" && environment !== "production") {
    throw new Error("SQUARE_ENVIRONMENT must be sandbox or production.");
  }
  return environment;
}
