import type { GetCatalogObjectResponse } from 'square';
import type { MenuItem, ModifierList, ModifierOption, ItemCategory } from "@/app/types/menu-item";
import type { CatalogObject } from 'square';

// Builds a full MenuItem from a Square GetCatalogObjectResponse
export function buildMenuItemFromGetResponse(result: GetCatalogObjectResponse): MenuItem | null {
    const catalogItem = result.object as CatalogObject.Item;
    const relatedObjects = result.relatedObjects ?? [];

    if (!catalogItem?.id) return null;

    const imageId = catalogItem.itemData?.imageIds?.[0];
    const imageObj = relatedObjects.find((o) => o.id === imageId) as CatalogObject.Image | undefined;

    // create a list of categories [{id: name}]
    const categories: ItemCategory[] = (catalogItem.itemData?.categories ?? [])
        .filter((c): c is { id: string } => !!c.id)
        .map((c) => {
            const obj = relatedObjects.find((o) => o.id === c.id) as CatalogObject.Category | undefined;
            return { id: c.id, name: obj?.categoryData?.name ?? null };
        });

    const variation = catalogItem.itemData?.variations?.[0] as CatalogObject.ItemVariation | undefined;
    const priceMoney = variation?.itemVariationData?.priceMoney;

    const modifiers: ModifierList[] = (catalogItem.itemData?.modifierListInfo ?? [])
        .flatMap((info) => {
            const listObj = relatedObjects.find(
                (o) => o.id === info.modifierListId && o.type === "MODIFIER_LIST"
            ) as CatalogObject.ModifierList | undefined;
            return listObj ? [buildModifierList(listObj)] : [];
        });

    return {
        catalogObjectId: catalogItem.id,
        name: catalogItem.itemData?.name,
        description: catalogItem.itemData?.description ?? undefined,
        variationId: variation?.id,
        priceCents: priceMoney ? Number(priceMoney.amount) : 0,
        currency: priceMoney?.currency ?? "USD",
        imageUrl: imageObj?.imageData?.url ?? null,
        categories,
        modifiers,
    };
}

// builds a ModifierList object from a CatalogObject.ModifierList
export function buildModifierList(obj: CatalogObject.ModifierList): ModifierList {
    const options: ModifierOption[] = (obj.modifierListData?.modifiers ?? []).map((mod) => {
        const modifier = mod as CatalogObject.Modifier;
        const priceMoney = modifier.modifierData?.priceMoney;
        return {
            id: modifier.id,
            name: modifier.modifierData?.name ?? undefined,
            priceCents: priceMoney ? Number(priceMoney.amount) : 0,
        };
    });

    return {
        id: obj.id,
        name: obj.modifierListData?.name ?? undefined,
        options,
    };
}