import { squareClient } from "@/app/lib/square";
import type { CatalogObject, Currency } from 'square';
import type { UpdateMenuItemBody } from "@/app/types/menu-item";
import { buildMenuItemFromGetResponse } from '@/app/lib/square-helpers';

/**
 * GET /api/square/products/:id
 *
 * Fetches the product from the Square catalog where catalogObjectId = :id.
 *
 * @returns 200 - A single MenuItem object
 * @returns 404 - Item not found
 * @returns 500 - Square API failure
 */
export async function GET(
    request: Request,
    ctx: RouteContext<"/api/square/products/[id]">
) {
    const { id } = await ctx.params;

    try {
        const result = await squareClient.catalog.object.get({
            objectId: id,
            includeRelatedObjects: true,
        });

        const menuItem = buildMenuItemFromGetResponse(result);
        if (!menuItem) {
            return Response.json({ error: "Catalog item missing id" }, { status: 500 });
        }

        return Response.json(menuItem);
    } catch (error: unknown) {
        if (isSquare404(error)) {
            return Response.json({ error: "Product not found" }, { status: 404 });
        }
        console.error("Square catalog fetch failed:", error);
        return Response.json({ error: "Failed to fetch product" }, { status: 500 });
    }
}

/**
 * PUT /api/square/products/:id
 *
 * Updates an existing catalog item. Omitted fields are left unchanged.
 * Pass an empty array for categoryIds or modifierListIds to remove all.
 *
 * @returns 200 - The updated MenuItem
 * @returns 404 - Item not found
 * @returns 500 - Square API failure
 */
export async function PUT(
    request: Request,
    ctx: RouteContext<"/api/square/products/[id]">
) {
    const { id } = await ctx.params;

    try {
        const body: UpdateMenuItemBody = await request.json();

        const existing = await squareClient.catalog.object.get({
            objectId: id,
            includeRelatedObjects: false,
        });

        const currentItem = existing.object as CatalogObject.Item;
        if (!currentItem?.id) {
            return Response.json({ error: "Product not found" }, { status: 404 });
        }

        const currentVariation = currentItem.itemData?.variations?.[0] as CatalogObject.ItemVariation | undefined;
        const currentPrice = currentVariation?.itemVariationData?.priceMoney;

        // Creates structure of Square catalog item and sends the put request
        const upsertResult = await squareClient.catalog.object.upsert({
            idempotencyKey: crypto.randomUUID(),
            object: {
                type: "ITEM",
                id: currentItem.id,
                version: currentItem.version,
                itemData: {
                    name: body.name ?? currentItem.itemData?.name,
                    description: body.description ?? currentItem.itemData?.description,
                    categories: body.categoryIds !== undefined
                        ? body.categoryIds.map((cid) => ({ id: cid }))
                        : currentItem.itemData?.categories,
                    modifierListInfo: body.modifierListIds !== undefined
                        ? body.modifierListIds.map((mid) => ({ modifierListId: mid, enabled: true }))
                        : currentItem.itemData?.modifierListInfo,
                    variations: [
                        {
                            type: "ITEM_VARIATION",
                            id: currentVariation?.id ?? "#variation",
                            version: currentVariation?.version,
                            itemVariationData: {
                                name: currentVariation?.itemVariationData?.name ?? "Regular",
                                pricingType: "FIXED_PRICING",
                                priceMoney: {
                                    amount: BigInt(body.priceCents ?? Number(currentPrice?.amount ?? 0)),
                                    currency: (body.currency ?? currentPrice?.currency ?? "USD") as Currency,
                                },
                            },
                        },
                    ],
                },
            },
        });

        const updatedId = upsertResult.catalogObject?.id ?? id;
        const getResult = await squareClient.catalog.object.get({
            objectId: updatedId,
            includeRelatedObjects: true,
        });

        const menuItem = buildMenuItemFromGetResponse(getResult);
        if (!menuItem) {
            return Response.json({ error: "Failed to build updated item" }, { status: 500 });
        }

        return Response.json(menuItem);
    } catch (error: unknown) {
        if (isSquare404(error)) {
            return Response.json({ error: "Product not found" }, { status: 404 });
        }
        console.error("Square catalog update failed:", error);
        return Response.json({ error: "Failed to update product" }, { status: 500 });
    }
}

/**
 * DELETE /api/square/products/:id
 *
 * Deletes a catalog item and all its variations.
 *
 * @returns 200 - `{ deletedObjectIds, deletedAt }`
 * @returns 404 - Item not found
 * @returns 500 - Square API failure
 */
export async function DELETE(
    request: Request,
    ctx: RouteContext<"/api/square/products/[id]">
) {
    const { id } = await ctx.params;

    try {
        const result = await squareClient.catalog.object.delete({ objectId: id });

        return Response.json({
            deletedObjectIds: result.deletedObjectIds ?? [],
            deletedAt: result.deletedAt ?? null,
        });
    } catch (error: unknown) {
        if (isSquare404(error)) {
            return Response.json({ error: "Product not found" }, { status: 404 });
        }
        console.error("Square catalog delete failed:", error);
        return Response.json({ error: "Failed to delete product" }, { status: 500 });
    }
}

function isSquare404(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        (error as { statusCode: number }).statusCode === 404
    );
}
