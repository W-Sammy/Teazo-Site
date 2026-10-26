import { SquareClient, SquareEnvironment } from 'square';
import { getSquareEnvironment } from "@/app/lib/square-config";
import { SQUARE_API_VERSION } from "@/app/lib/square-option-rules";

if (!process.env.SQUARE_ACCESS_TOKEN) {
    throw new Error("SQUARE_ACCESS_TOKEN is not set");
}

export const squareClient = new SquareClient({
    version: SQUARE_API_VERSION,
    environment: getSquareEnvironment() === "production"
        ? SquareEnvironment.Production
        : SquareEnvironment.Sandbox,
    token: process.env.SQUARE_ACCESS_TOKEN,
    // Availability reads must bypass Next.js and HTTP caches, including SDK GETs.
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
});

// Fixes "TypeError: BigInt value can't be serialized in JSON"
declare global {
    interface BigInt {
        toJSON(): number;
    }
}

BigInt.prototype.toJSON = function () {
    return Number(this);
};
