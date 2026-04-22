import { squareClient } from "@/app/lib/square";
import type { CatalogObject } from 'square';
import type { MenuItem, ModifierList, ModifierOption } from "@/app/types/menu-item";
import { buildModifierList } from '@/app/lib/square-helpers';

/**
 * GET /api/products/:id
 *
 * Fetches the product from the Square catalog where catalogObjectId = :id.
 *
 * @returns 200 - A single MenuItem objects
 * @returns 500 - Square API failure or unexpected catalog data
 */
export async function GET(
    request: Request,
    ctx: RouteContext<"/api/square/products/[id]">
) {
    // Retrieve the catalogObjectId from the URL parameters
    const { id } = await ctx.params;

    // Uses the catalogObjectId to fetch from the Square catalog
    const result = await squareClient.catalog.object.get({
        objectId: id,
        includeRelatedObjects: true,
    });

    const catalogItem = result.object as CatalogObject.Item;
    const relatedObjects = result.relatedObjects ?? [];

    // Checks if the item was not found
    if (!catalogItem) {
        return Response.json(null, { status: 404 });
    }

    // Checks if the item does not have an id
    if (!catalogItem.id) {
        return Response.json (
            { error: "Catalog item missing id" },
            { status: 500 }
        );
    }

    // extract imageId then finds the imageObj
    const imageId = catalogItem.itemData?.imageIds?.[0];
    const imageObj = relatedObjects.find((o) => o.id === imageId) as CatalogObject.Image | undefined;

    // extract categoryId then finds the categoryObj
    const categoryId = catalogItem.itemData?.categories?.[0]?.id ?? null;
    const categoryObj = relatedObjects.find((o) => o.id === categoryId) as CatalogObject.Category | undefined;

    // extract variation and priceMoney
    const variation = catalogItem.itemData?.variations?.[0] as CatalogObject.ItemVariation | undefined;
    const priceMoney = variation?.itemVariationData?.priceMoney;

    // extract modifierLists
    const modifiers: ModifierList[] = (catalogItem.itemData?.modifierListInfo ?? [])
        .flatMap((info) => {
            const listObj = relatedObjects.find((o) => o.id === info.modifierListId && o.type === "MODIFIER_LIST") as CatalogObject.ModifierList | undefined;
            return listObj ? [buildModifierList(listObj)] : [];
        });

    // assemble MenuItem
    const menuItem: MenuItem = {
        catalogObjectId: catalogItem.id,
        name: catalogItem.itemData?.name,
        description: catalogItem.itemData?.description ?? undefined,
        variationId: variation?.id,
        priceCents: priceMoney ? Number(priceMoney.amount) : 0,
        currency: priceMoney?.currency ?? "USD",
        imageUrl: imageObj?.imageData?.url ?? null,
        categoryId,
        categoryName: categoryObj?.categoryData?.name ?? null,
        modifiers,
    };

    return Response.json(menuItem);
}
