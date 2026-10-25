export type SquareEnvironmentName = "sandbox" | "production";

/** Shared by Next.js startup validation and server-side Square configuration. */
export function resolveSquareEnvironment(
  value: string | undefined,
): SquareEnvironmentName {
  if (value === undefined) return "sandbox";
  if (value === "sandbox" || value === "production") return value;

  throw new Error(
    'SQUARE_ENVIRONMENT must be "sandbox" or "production". Leave it unset to use sandbox.',
  );
}
