export interface ModifierOption {
    id: string;
    name: string | undefined;
    priceCents: number;
}

export interface ModifierList {
    id: string;
    name: string | undefined;
    selectionType?: "SINGLE" | "MULTIPLE";
    minSelectedModifiers?: number;
    maxSelectedModifiers?: number;
    options: ModifierOption[];
}

export interface ItemCategory {
    id: string;
    name: string | null;
}

export interface ItemVariation {
    id: string;
    name: string | null | undefined;
    priceCents: number;
}

export interface MenuItem {
    catalogObjectId: string;
    name: string | null | undefined;
    description: string | undefined;
    variationId: string | undefined;
    priceCents: number;
    currency: string;
    imageUrl: string | null;
    categories: ItemCategory[];
    modifiers: ModifierList[];
    variations?: ItemVariation[];
}

export interface Category {
    categoryId: string | null;
    categoryName: string | null;
}

export interface CreateMenuItemBody {
    name: string;
    description?: string;
    priceCents: number;
    currency?: string;
    categoryIds?: string[];
    modifierListIds?: string[];
}

export interface UpdateMenuItemBody {
    name?: string;
    description?: string;
    priceCents?: number;
    currency?: string;
    categoryIds?: string[];
    modifierListIds?: string[];
}

export * from "./checkout";
