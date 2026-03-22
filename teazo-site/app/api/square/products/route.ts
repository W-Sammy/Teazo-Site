import { squareClient } from "@/app/lib/square";
import type { CatalogObject } from 'square';


export async function GET() {
    const itemResult = await squareClient.catalog.list({ types: "ITEM" });
    const imageResult = await squareClient.catalog.list({ types: "IMAGE" });
    const categoryResult = await squareClient.catalog.list({ types: "CATEGORY" });

    const imageMap = new Map();
    for await (const img of imageResult) {
        imageMap.set(img.id, (img as CatalogObject.Image).imageData?.url);
    }

    const categoryMap = new Map();
    for await (const category of categoryResult) {
        categoryMap.set(category.id, (category as CatalogObject.Category).categoryData?.name);
    }

    const items = [];
    for await (const item of itemResult) {
        items.push(item);
    }

    const products = items.map((item) => {
        const catalogItem = item as CatalogObject.Item;
        const variation = catalogItem.itemData?.variations?.[0] as CatalogObject.ItemVariation | undefined;
        const priceMoney = variation?.itemVariationData?.priceMoney;
        const imageId = catalogItem.itemData?.imageIds?.[0];
        const categoryId = catalogItem.itemData?.categories?.[0]?.id;

        return {
            catalogObjectId: item.id,
            name: catalogItem.itemData?.name,
            variationId: variation?.id,
            priceCents: priceMoney ? Number(priceMoney.amount) : 0,
            currency: priceMoney?.currency || "USD",
            imageUrl: imageId ? imageMap.get(imageId) : null,
            categoryId: categoryId ?? null,
            categoryName: categoryId ? categoryMap.get(categoryId) ?? null : null,
        };
    });

    return Response.json(products);
}