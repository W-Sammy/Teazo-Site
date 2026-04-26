import { squareClient } from "@/app/lib/square";
import type { CatalogObject } from 'square';
import type {Category} from "@/app/types/menu-item";

/**
 * GET /api/categories
 *
 * Fetches all active categories from the Square catalog.
 *
 * @returns 200 - Array of Category objects `[{ categoryId, categoryName }]`
 * @returns 500 - Square API failure or unexpected catalog data
 */
export async function GET() {
    try {

        // Use Square Client to fetch categories
        const categoryResult = await squareClient.catalog.list({types: "CATEGORY"})

        const categories: Category[] = [];

        // Fill Category[] with category ids and category names
        for await (const category of categoryResult) {

            if (!category.id) continue; // Skip categories without an ID

            categories.push({
                categoryId: category.id,
                categoryName: (category as CatalogObject.Category).categoryData?.name ?? null
            });
        }

        // Return the categories as JSON
        return Response.json(categories);

    } catch (error) {
        console.error("Square categories fetch failed:", error);
        return Response.json({ error: "Failed to fetch categories" }, { status: 500 });
    }
}