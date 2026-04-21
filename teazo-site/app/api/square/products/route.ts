import { squareClient } from "@/app/lib/square";
import type { CatalogObject } from 'square';
import type { MenuItem, ModifierList, ModifierOption } from "@/app/types/menu-item";

// Helper function to build a ModifierList object from a CatalogObject.ModifierList
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

/**
 * GET /api/products
 *
 * Fetches all active products from the Square catalog.
 *
 * @returns 200 - Array of MenuItem objects
 * @returns 500 - Square API failure or unexpected catalog data
 */
export async function GET() {
    try {
        // Fetch all catalog objects in parallel
        const [itemResult, imageResult, categoryResult, modifierListResult] = await Promise.all([
            squareClient.catalog.list({ types: "ITEM" }),
            squareClient.catalog.list({ types: "IMAGE" }),
            squareClient.catalog.list({ types: "CATEGORY" }),
            squareClient.catalog.list({ types: "MODIFIER_LIST" }),
        ]);

        // Create a map of the image data
        const imageMap = new Map<string, string>();
        for await (const img of imageResult) {
            if (!img.id) {
                console.warn("Skipping unexpected image object:", img);
                continue;
            }
            imageMap.set(img.id, (img as CatalogObject.Image).imageData?.url ?? "");
        }

        // Create a map of the category data
        const categoryMap = new Map<string, string>();
        for await (const category of categoryResult) {
            if (!category.id) {
                console.warn("Skipping unexpected category object:", category);
                continue;
            }
            categoryMap.set(category.id, (category as CatalogObject.Category).categoryData?.name ?? "");
        }

        // Create a map of the modified data
        const modifierListMap = new Map<string, ModifierList>();
        for await (const obj of modifierListResult) {
            const modifierList = buildModifierList(obj as CatalogObject.ModifierList);
            if (!obj.id) {
                console.warn("Skipping unexpected modifier object:", obj);
                continue;
            }
            modifierListMap.set(obj.id, modifierList);
        }

        const products: MenuItem[] = [];

        // Fill MenuItem[] with catalog item data
        for await (const item of itemResult) {
            const catalogItem = item as CatalogObject.Item;
            const variation = catalogItem.itemData?.variations?.[0] as CatalogObject.ItemVariation | undefined;
            const priceMoney = variation?.itemVariationData?.priceMoney;
            const imageId = catalogItem.itemData?.imageIds?.[0];
            const categoryId = catalogItem.itemData?.categories?.[0]?.id ?? null;

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
