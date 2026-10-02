import { squareClient } from "@/app/lib/square";
import type { CatalogObject, Currency } from "square";
import { buildMenuItemFromGetResponse } from "@/app/lib/square-helpers";
import { requireAdminApi } from "@/app/lib/admin";
import { validateUpdateMenuItemBody } from "@/app/lib/menu-item-validators";

/**
 * GET /api/square/products/:id
 *
 * Fetches the product from the Square catalog where catalogObjectId = :id.
 *
 * @returns 200 - A single MenuItem object
 * @returns 404 - Item not found
 * @returns 500 - Square API failure
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/square/products/[id]">,
) {
  const { id } = await ctx.params;

  try {
    const result = await squareClient.catalog.object.get({
      objectId: id,
      includeRelatedObjects: true,
    });

    const menuItem = buildMenuItemFromGetResponse(result);

    if (!menuItem) {
      return Response.json(
        { error: "Catalog item missing id" },
        { status: 500 },
      );
    }

    return Response.json(menuItem);
  } catch (error: unknown) {
    if (isSquare404(error)) {
      return Response.json(
        { error: "Product not found" },
        { status: 404 },
      );
    }

    console.error("Square catalog fetch failed:", error);

    return Response.json(
      { error: "Failed to fetch product" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/square/products/:id
 *
 * Updates an existing catalog item. Omitted fields are left unchanged.
 * Pass an empty array for categoryIds or modifierListIds to remove all.
 *
 * The current menu UI displays the first variation's price. A price update
 * changes that variation only; other variations and their settings are retained.
 * Image changes are not handled here. Existing Square image IDs are preserved.
 *
 * @returns 200 - The updated MenuItem
 * @returns 400 - Invalid request data or unsupported price configuration
 * @returns 404 - Item not found
 * @returns 409 - Conflicting update or missing price variation
 * @returns 500/502 - Square failure or update result could not be confirmed
 */
export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/square/products/[id]">,
) {
  const access = await requireAdminApi(request, 2);

  if (!access.ok) {
    return access.response;
  }

  const { id } = await ctx.params;
  let updateConfirmed = false;

  try {
    let requestBody: unknown;

    try {
      requestBody = await request.json();
    } catch {
      return updateError("Request body must contain valid JSON.", 400);
    }

    // Keep the TZ-165 validation before any Square lookup or write.
    const validation = validateUpdateMenuItemBody(requestBody);

    if (!validation.ok) {
      return updateError(validation.error, 400);
    }

    const body = validation.data;

    const existing = await squareClient.catalog.object.get({
      objectId: id,
      includeRelatedObjects: false,
    });

    const currentItem = existing.object;

    if (
      !currentItem?.id ||
      currentItem.type !== "ITEM" ||
      currentItem.isDeleted ||
      !currentItem.itemData
    ) {
      return updateError("Product not found", 404);
    }

    /*
     * Square replaces catalog objects rather than applying a partial patch.
     * Start with the stored object so images, taxes, location settings,
     * variations, and other fields absent from this form are not discarded.
     */
    const itemData = { ...currentItem.itemData };

    if (body.name !== undefined) {
      itemData.name = body.name;
    }

    if (
      body.description !== undefined &&
      body.description !== (currentItem.itemData.description ?? "")
    ) {
      // The form edits plain text. Encode it for Square's HTML description.
      // Updating both avoids an old descriptionHtml overriding the new text.
      itemData.description = body.description;
      itemData.descriptionHtml = plainTextToHtml(body.description);

      delete itemData.descriptionPlaintext;
    }

    if (body.categoryIds !== undefined) {
      // Preserve the ordinal/settings of categories that remain selected.
      itemData.categories = [...new Set(body.categoryIds)].map(
        (categoryId) =>
          currentItem.itemData?.categories?.find(
            (category) => category.id === categoryId,
          ) ?? { id: categoryId },
      );

      // Do not let the deprecated single-category field conflict with this list.
      delete itemData.categoryId;
    }

    if (body.modifierListIds !== undefined) {
      // Retain existing per-item modifier settings; only new links get defaults.
      itemData.modifierListInfo = [...new Set(body.modifierListIds)].map(
        (modifierListId) =>
          currentItem.itemData?.modifierListInfo?.find(
            (info) => info.modifierListId === modifierListId,
          ) ?? { modifierListId, enabled: true },
      );
    }

    if (body.priceCents !== undefined || body.currency !== undefined) {
      const variations = currentItem.itemData.variations ?? [];
      const firstVariation = variations[0];

      if (
        !firstVariation?.id ||
        firstVariation.type !== "ITEM_VARIATION" ||
        firstVariation.isDeleted ||
        !firstVariation.itemVariationData
      ) {
        return updateError(
          "This item's price variation is unavailable. Reload the menu before editing it.",
          409,
        );
      }

      const currentPrice = firstVariation.itemVariationData.priceMoney;

      // Do not silently convert a variable-price item or invent a missing price.
      if (
        firstVariation.itemVariationData.pricingType !== "FIXED_PRICING" ||
        currentPrice?.amount == null ||
        !currentPrice.currency
      ) {
        return updateError(
          "This form currently supports editing fixed-price items only.",
          400,
        );
      }

      const updatedVariation: CatalogObject.ItemVariation = {
        ...firstVariation,
        itemVariationData: {
          ...firstVariation.itemVariationData,
          priceMoney: {
            ...currentPrice,
            amount:
              body.priceCents !== undefined
                ? BigInt(body.priceCents)
                : currentPrice.amount,
            currency: (body.currency ?? currentPrice.currency) as Currency,
          },
        },
      };

      // Keep all variations, including their IDs, versions, SKU, and inventory data.
      itemData.variations = variations.map((variation, index) =>
        index === 0 ? updatedVariation : variation,
      );
    }

    const updatedItem: CatalogObject.Item = {
      ...currentItem,
      itemData,
    };

    const upsertResult = await squareClient.catalog.object.upsert({
      idempotencyKey: crypto.randomUUID(),
      object: updatedItem,
    });

    if (upsertResult.catalogObject?.id !== id) {
      return updateError(
        "The item update could not be confirmed. Reload the menu before trying again.",
        502,
      );
    }

    updateConfirmed = true;

    const getResult = await squareClient.catalog.object.get({
      objectId: id,
      includeRelatedObjects: true,
    });

    const menuItem = buildMenuItemFromGetResponse(getResult);

    if (!menuItem) {
      return updateError(
        "The item was saved, but the updated details could not be loaded. Reload the menu before trying again.",
        502,
      );
    }

    return Response.json(menuItem, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    console.error("Square catalog update failed:", error);

    // A failure while reloading is not the same as a rejected update.
    if (updateConfirmed) {
      return updateError(
        "The item was saved, but the updated details could not be loaded. Reload the menu before trying again.",
        502,
      );
    }

    if (isSquare404(error)) {
      return updateError("Product not found", 404);
    }

    if (hasSquareErrorCode(error, "VERSION_MISMATCH")) {
      return updateError(
        "This item changed while it was being saved. Reload the menu and try again.",
        409,
      );
    }

    return updateError(
      "The item update could not be confirmed. Reload the menu before trying again.",
      500,
    );
  }
}

/**
 * DELETE /api/square/products/:id
 *
 * Deletes a catalog item and all its variations.
 *
 * @returns 200 - `{ deletedObjectIds, deletedAt }`
 * @returns 404 - Item not found
 * @returns 500 - Square API failure
 */
export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/square/products/[id]">,
) {
  const access = await requireAdminApi(request, 2);

  if (!access.ok) {
    return access.response;
  }

  const { id } = await ctx.params;

  try {
    const result = await squareClient.catalog.object.delete({
      objectId: id,
    });

    return Response.json({
      deletedObjectIds: result.deletedObjectIds ?? [],
      deletedAt: result.deletedAt ?? null,
    });
  } catch (error: unknown) {
    if (isSquare404(error)) {
      return Response.json(
        { error: "Product not found" },
        { status: 404 },
      );
    }

    console.error("Square catalog delete failed:", error);

    return Response.json(
      { error: "Failed to delete product" },
      { status: 500 },
    );
  }
}

function updateError(message: string, status: number): Response {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function plainTextToHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r\n|\r|\n/g, "<br>");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasSquareErrorCode(error: unknown, code: string): boolean {
  if (!isRecord(error)) return false;

  const errors = Array.isArray(error.errors)
    ? error.errors
    : isRecord(error.body) && Array.isArray(error.body.errors)
      ? error.body.errors
      : [];

  return errors.some((entry) => isRecord(entry) && entry.code === code);
}

function isSquare404(error: unknown): boolean {
  return isRecord(error) && error.statusCode === 404;
}