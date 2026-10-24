import type { GetCatalogObjectResponse } from 'square';
import type { MenuItem, ModifierList, ModifierOption, ItemCategory, ItemVariation } from "@/app/types/menu-item";
import type { CatalogObject } from 'square';
import type { CatalogItemModifierListInfo } from 'square';
import { itemAvailability, modifierAvailability, variationAvailability } from './catalog-availability';
import { resolveModifierListRules, resolveModifierOptionRules } from './square-option-rules';

// Builds a full MenuItem from a Square GetCatalogObjectResponse
export function buildMenuItemFromGetResponse(result: GetCatalogObjectResponse, locationId: string, now = Date.now()): MenuItem | null {
    const catalogItem = result.object as CatalogObject.Item;
    const relatedObjects = result.relatedObjects ?? [];

    if (!catalogItem?.id || catalogItem.type !== "ITEM") return null;

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

    const variations: ItemVariation[] = (
        (catalogItem.itemData?.variations ?? []) as CatalogObject.ItemVariation[]
    ).map((v) => {
        const p = v.itemVariationData?.priceMoney;
        return {
            id: v.id ?? "",
            name: v.itemVariationData?.name ?? null,
            priceCents: p ? Number(p.amount) : 0,
            availability: variationAvailability(v, locationId, now),
        };
    });

    const modifiers: ModifierList[] = (catalogItem.itemData?.modifierListInfo ?? [])
        .map((info) => {
            const listObj = (relatedObjects.find(
                (o) => o.id === info.modifierListId && o.type === "MODIFIER_LIST"
            ) as CatalogObject.ModifierList | undefined) ?? {
                id: info.modifierListId,
                type: "MODIFIER_LIST",
                isDeleted: true,
            };
            return buildModifierList(listObj, locationId, info);
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
        variations,
        availability: itemAvailability(catalogItem, variations, modifiers, locationId),
    };
}

// builds a ModifierList object from a CatalogObject.ModifierList
export function buildModifierList(obj: CatalogObject.ModifierList, locationId: string, info?: CatalogItemModifierListInfo): ModifierList {
    const options: ModifierOption[] = (obj.modifierListData?.modifiers ?? []).map((mod) => {
        const modifier = mod as CatalogObject.Modifier;
        const priceMoney = modifier.modifierData?.priceMoney;
        const rules = resolveModifierOptionRules(modifier.modifierData ?? {}, info?.modifierOverrides?.find((override) => override.modifierId === modifier.id));
        return {
            id: modifier.id,
            name: modifier.modifierData?.name ?? undefined,
            priceCents: priceMoney ? Number(priceMoney.amount) : 0,
            ...rules,
            availability: modifierAvailability(modifier, locationId, rules.hiddenOnline),
        };
    });

    const rules = resolveModifierListRules(obj.modifierListData ?? {}, info);
    if (obj.isDeleted || !obj.modifierListData) rules.configurationIssues.push({
        code: "MISSING_MODIFIER_LIST", message: "An option group is missing or deleted in Square.",
    });

    return {
        id: obj.id,
        name: obj.modifierListData?.name ?? undefined,
        ...rules,
        options,
    };
}
