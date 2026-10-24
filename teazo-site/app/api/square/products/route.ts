import { squareClient } from "@/app/lib/square";
import type { CatalogObject, Currency } from "square";
import type {
  MenuItem,
  ModifierList,
  ItemCategory,
  ItemVariation,
} from "@/app/types/menu-item";
import {
  buildModifierList,
  buildMenuItemFromGetResponse,
} from "@/app/lib/square-helpers";
import { requireAdminApi } from "@/app/lib/admin";
import { resolveSquareLocationId } from "@/app/lib/square-location";
import { readCatalogItems, readCatalogModifierLists } from "@/app/lib/square-catalog";
import { itemAvailability, variationAvailability } from "@/app/lib/catalog-availability";
import { validateCreateMenuItemBody } from "@/app/lib/menu-item-validators";

/**
 * GET /api/products
 *
 * Fetches all products, including archived and unavailable items, from the Square catalog.
 *
 * @returns 200 - Array of MenuItem objects
 * @returns 500 - Square API failure or unexpected catalog data
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const locationId = await resolveSquareLocationId();
    // Fetch all catalog objects in parallel
    const [itemResult, imageResult, categoryResult, modifierListResult] =
      await Promise.all([
        readCatalogItems(),
        squareClient.catalog.list({ types: "IMAGE" }),
        squareClient.catalog.list({ types: "CATEGORY" }),
        readCatalogModifierLists(),
      ]);

    // Create a map of the image data
    const imageMap = new Map<string, string>();
    for await (const img of imageResult) {
      if (!img.id) {
        console.warn("Skipping unexpected image object:", img);
        continue;
      }

      imageMap.set(
        img.id,
        (img as CatalogObject.Image).imageData?.url ?? "",
      );
    }

    // Create a map of the category data
    const categoryMap = new Map<string, string>();
    for await (const category of categoryResult) {
      if (!category.id) {
        console.warn("Skipping unexpected category object:", category);
        continue;
      }

      categoryMap.set(
        category.id,
        (category as CatalogObject.Category).categoryData?.name ?? "",
      );
    }

    // Create a map of the modified data
    const modifierListMap = new Map<string, CatalogObject.ModifierList>();
    for await (const obj of modifierListResult) {
      if (!obj.id) {
        console.warn("Skipping unexpected modifier object:", obj);
        continue;
      }

      modifierListMap.set(obj.id, obj);
    }

    const products: MenuItem[] = [];

    // Fill MenuItem[] with catalog item data
    for await (const item of itemResult) {
      const catalogItem = item as CatalogObject.Item;
      const variation = catalogItem.itemData?.variations?.[0] as
        | CatalogObject.ItemVariation
        | undefined;
      const priceMoney = variation?.itemVariationData?.priceMoney;
      const imageId = catalogItem.itemData?.imageIds?.[0];

      const categories: ItemCategory[] = (
        catalogItem.itemData?.categories ?? []
      )
        .filter((c): c is { id: string } => !!c.id)
        .map((c) => ({
          id: c.id,
          name: categoryMap.get(c.id) ?? null,
        }));

      if (!item.id) {
        return Response.json(
          { error: "Catalog item missing id" },
          { status: 500, headers: { "Cache-Control": "no-store" } },
        );
      }

      const modifiers: ModifierList[] = (catalogItem.itemData?.modifierListInfo ?? [])
        .flatMap((info) => {
          const list = modifierListMap.get(info.modifierListId);
          return list ? [buildModifierList(list, locationId, info)] : [];
        });

      const variations: ItemVariation[] = (
        (catalogItem.itemData?.variations ?? []) as CatalogObject.ItemVariation[]
      ).map((v) => {
        const p = v.itemVariationData?.priceMoney;
        return {
          id: v.id ?? "",
          name: v.itemVariationData?.name ?? null,
          priceCents: p ? Number(p.amount) : 0,
          availability: variationAvailability(v, locationId),
        };
      });

      products.push({
        catalogObjectId: item.id,
        availability: itemAvailability(catalogItem, variations, modifiers, locationId),
        name: catalogItem.itemData?.name,
        description:
          catalogItem.itemData?.description ?? undefined,
        variationId: variation?.id,
        priceCents: priceMoney
          ? Number(priceMoney.amount)
          : 0,
        currency: priceMoney?.currency ?? "USD",
        imageUrl: imageId
          ? (imageMap.get(imageId) ?? null)
          : null,
        categories,
        modifiers,
        variations,
      });
    }

    return Response.json(products, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Square catalog fetch failed:", error);

    return Response.json(
      { error: "Failed to fetch products" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

/**
 * POST /api/square/products
 *
 * Creates a new catalog item in Square.
 *
 * @returns 201 - The created MenuItem
 * @returns 400 - Invalid request data
 * @returns 500 - Square API failure
 */
export async function POST(request: Request) {
  const access = await requireAdminApi(request, 2);

  if (!access.ok) {
    return access.response;
  }

  try {
    let requestBody: unknown;

    try {
      requestBody = await request.json();
    } catch {
      return Response.json(
        {
          error: "Request body must contain valid JSON.",
        },
        { status: 400 },
      );
    }

    const validation =
      validateCreateMenuItemBody(requestBody);

    if (!validation.ok) {
      return Response.json(
        { error: validation.error },
        { status: 400 },
      );
    }

    const body = validation.data;
    const locationId = await resolveSquareLocationId();

    // Defines structure of Square catalogItem then sends it to Square
    const upsertResult =
      await squareClient.catalog.object.upsert({
        idempotencyKey: crypto.randomUUID(),
        object: {
          type: "ITEM",
          id: "#new-item",
          itemData: {
            name: body.name,
            description: body.description,
            categories: body.categoryIds?.map((id) => ({
              id,
            })),
            modifierListInfo:
              body.modifierListIds?.map((id) => ({
                modifierListId: id,
                enabled: true,
              })),
            variations: [
              {
                type: "ITEM_VARIATION",
                id: "#new-variation",
                itemVariationData: {
                  name: "Regular",
                  pricingType: "FIXED_PRICING",
                  priceMoney: {
                    amount: BigInt(body.priceCents),
                    currency: (body.currency ??
                      "USD") as Currency,
                  },
                },
              },
            ],
          },
        },
      });

    const newId = upsertResult.idMappings?.find(
      (mapping) =>
        mapping.clientObjectId === "#new-item",
    )?.objectId;

    if (!newId) {
      return Response.json(
        {
          error: "Failed to retrieve created item id",
        },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    const getResult =
      await squareClient.catalog.object.get({
        objectId: newId,
        includeRelatedObjects: true,
      });

    const menuItem =
      buildMenuItemFromGetResponse(getResult, locationId);

    if (!menuItem) {
      return Response.json(
        {
          error: "Failed to build created item",
        },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(menuItem, {
      status: 201,
    });
  } catch (error) {
    console.error(
      "Square catalog create failed:",
      error,
    );

    return Response.json(
      { error: "Failed to create product" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
