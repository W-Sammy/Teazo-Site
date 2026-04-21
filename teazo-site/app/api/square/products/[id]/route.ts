import { squareClient } from "@/app/lib/square";
import type { CatalogObject } from 'square';
import type { MenuItem, ModifierList, ModifierOption } from "@/app/types/menu-item";
import { buildModifierList } from '@/app/lib/square-helpers';


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
    // ensures that item id does exist. required for item components
    if (!item.id) {
    return Response.json (
        { error: "Catalog item missing id" },
        { status: 500 }
    );
}

    const catalogItem = item as CatalogObject.Item;
    const relatedObjects = result.relatedObjects ?? [];

    const imageId = catalogItem.itemData?.imageIds?.[0];
    const imageObj = relatedObjects.find((o) => o.id === imageId) as CatalogObject.Image | undefined;

    const categoryId = catalogItem.itemData?.categories?.[0]?.id ?? null;
    const categoryObj = relatedObjects.find((o) => o.id === categoryId) as CatalogObject.Category | undefined;

    const variation = catalogItem.itemData?.variations?.[0] as CatalogObject.ItemVariation | undefined;
    const priceMoney = variation?.itemVariationData?.priceMoney;

    const modifiers: ModifierList[] = (catalogItem.itemData?.modifierListInfo ?? [])
        .flatMap((info) => {
            const listObj = relatedObjects.find((o) => o.id === info.modifierListId && o.type === "MODIFIER_LIST") as CatalogObject.ModifierList | undefined;
            return listObj ? [buildModifierList(listObj)] : [];
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
