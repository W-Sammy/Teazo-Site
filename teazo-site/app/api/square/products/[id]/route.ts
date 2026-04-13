import { squareClient } from "@/app/lib/square";
import type { CatalogObject } from 'square';
import type { MenuItem, ModifierList, ModifierOption } from "@/app/types/menu-item";


export async function GET(
    request: Request,
    ctx: RouteContext<"/api/square/products/[id]">
) {
    const { id } = await ctx.params;

    const result = await squareClient.catalog.object.get({
        objectId: id,
        includeRelatedObjects: true,
    });

    const item = result.object;
    if (!item) {
        return Response.json(null, { status: 404 });
    }

    const catalogItem = item as CatalogObject.Item;
    const relatedObjects = result.relatedObjects ?? [];

    const imageId = catalogItem.itemData?.imageIds?.[0];
    const imageObj = relatedObjects.find((o) => o.id === imageId) as CatalogObject.Image | undefined;

    const categoryId = catalogItem.itemData?.categories?.[0]?.id ?? null;
    const categoryObj = relatedObjects.find((o) => o.id === categoryId) as CatalogObject.Category | undefined;

    const variation = catalogItem.itemData?.variations?.[0] as CatalogObject.ItemVariation | undefined;
    const priceMoney = variation?.itemVariationData?.priceMoney;

    const modifiers: ModifierList[] = (catalogItem.itemData?.modifierListInfo ?? []).flatMap((info) => {
        const modifierListObj = relatedObjects.find((o) => o.id === info.modifierListId) as CatalogObject.ModifierList | undefined;
        if (!modifierListObj) return [];

        const options: ModifierOption[] = (modifierListObj.modifierListData?.modifiers ?? []).map((mod) => {
            const modifier = mod as CatalogObject.Modifier;
            const modPriceMoney = modifier.modifierData?.priceMoney;
            return {
                id: modifier.id,
                name: modifier.modifierData?.name ?? undefined,
                priceCents: modPriceMoney ? Number(modPriceMoney.amount) : 0,
            };
        });

        return [{
            id: modifierListObj.id,
            name: modifierListObj.modifierListData?.name ?? undefined,
            options,
        }];
    });

    const menuItem: MenuItem = {
        catalogObjectId: item.id,
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
