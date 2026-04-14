import { squareClient } from "@/app/lib/square";
import type { CatalogObject } from 'square';
import type { MenuItem, ModifierList, ModifierOption } from "@/app/types/menu-item";


function buildModifierList(obj: CatalogObject.ModifierList): ModifierList {
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


export async function GET() {
    try {
        const [itemResult, imageResult, categoryResult, modifierListResult] = await Promise.all([
            squareClient.catalog.list({ types: "ITEM" }),
            squareClient.catalog.list({ types: "IMAGE" }),
            squareClient.catalog.list({ types: "CATEGORY" }),
            squareClient.catalog.list({ types: "MODIFIER_LIST" }),
        ]);

        const imageMap = new Map<string, string>();
        for await (const img of imageResult) {
            //checks to ensure img.id exist
            if (!img.id) {
                return Response.json (
                    { error: "Catalog item missing id" },
                    { status: 500 }
                );
            }
            imageMap.set(img.id, (img as CatalogObject.Image).imageData?.url ?? "");
        }

        const categoryMap = new Map<string, string>();
        for await (const category of categoryResult) {
            //checks to ensure category.id exist
            if (!category.id) {
                return Response.json (
                    { error: "Catalog item missing id" },
                    { status: 500 }
                );
            }
            categoryMap.set(category.id, (category as CatalogObject.Category).categoryData?.name ?? "");
        }

        const modifierListMap = new Map<string, ModifierList>();
        for await (const obj of modifierListResult) {
            const modifierList = buildModifierList(obj as CatalogObject.ModifierList);
            //checks to ensure obj.id exist
            if (!obj.id) {
                return Response.json (
                    { error: "Catalog item missing id" },
                    { status: 500 }
                );
            }
            modifierListMap.set(obj.id, modifierList);
        }

        const products: MenuItem[] = [];
        for await (const item of itemResult) {
            const catalogItem = item as CatalogObject.Item;
            const variation = catalogItem.itemData?.variations?.[0] as CatalogObject.ItemVariation | undefined;
            const priceMoney = variation?.itemVariationData?.priceMoney;
            const imageId = catalogItem.itemData?.imageIds?.[0];
            const categoryId = catalogItem.itemData?.categories?.[0]?.id ?? null;

            //checks to ensure item.id exist
            if (!item.id) {
                return Response.json (
                    { error: "Catalog item missing id" },
                    { status: 500 }
                );
            }

            const modifiers: ModifierList[] = (catalogItem.itemData?.modifierListInfo ?? [])
                .map((info) => modifierListMap.get(info.modifierListId ?? ""))
                .filter((ml): ml is ModifierList => ml !== undefined);

            products.push({
                catalogObjectId: item.id,
                name: catalogItem.itemData?.name,
                description: catalogItem.itemData?.description ?? undefined,
                variationId: variation?.id,
                priceCents: priceMoney ? Number(priceMoney.amount) : 0,
                currency: priceMoney?.currency ?? "USD",
                imageUrl: imageId ? imageMap.get(imageId) ?? null : null,
                categoryId,
                categoryName: categoryId ? categoryMap.get(categoryId) ?? null : null,
                modifiers,
            });
        }

        return Response.json(products);
    } catch (error) {
        console.error("Square catalog fetch failed:", error);
        return Response.json({ error: "Failed to fetch products" }, { status: 500 });
    }
}
