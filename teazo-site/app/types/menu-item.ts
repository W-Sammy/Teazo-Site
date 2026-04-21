export interface ModifierOption {
    id: string;
    name: string | undefined;
    priceCents: number;
}

export interface ModifierList {
    id: string;
    name: string | undefined;
    options: ModifierOption[];
}

export interface MenuItem {
    catalogObjectId: string;
    name: string | null | undefined;
    description: string | undefined;
    variationId: string | undefined;
    priceCents: number;
    currency: string;
    imageUrl: string | null;
    categoryId: string | null;
    categoryName: string | null;
    modifiers: ModifierList[];
}

export interface Category {
    categoryId: string | null;
    categoryName: string | null;
}
