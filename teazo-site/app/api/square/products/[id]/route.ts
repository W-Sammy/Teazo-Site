import {squareClient} from "@/app/lib/square";


export async function GET(
    request: Request,
    ctx: RouteContext<"/api/square/products/[id]">
) {
    const { id } = await ctx.params;

    const result = await squareClient.catalog.object.get({
        objectId: id,
    });
    return Response.json(result.object ?? null);
}