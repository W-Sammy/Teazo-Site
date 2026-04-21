import type { MenuItem, ModifierList, ModifierOption } from "@/app/types/menu-item";
import type { CatalogObject } from 'square';


// Helper function to build a ModifierList object from a CatalogObject.ModifierList
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