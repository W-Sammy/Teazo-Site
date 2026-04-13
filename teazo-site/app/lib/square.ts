import { SquareClient, SquareEnvironment } from 'square';

if (!process.env.SQUARE_ACCESS_TOKEN) {
    throw new Error("SQUARE_ACCESS_TOKEN is not set");
}

export const squareClient = new SquareClient({
    environment: SquareEnvironment.Sandbox,
    token: process.env.SQUARE_ACCESS_TOKEN,
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