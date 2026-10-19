
/**
 * Shared button styles for Teazo admin pages.
 *
 * Used by Admin Gallery, Events, Menu, and other admin pages.
 *
 * Keep colors, typography, and common button styling here.
 * Individual components can add layout-specific classes such as
 * width, margins, and responsive positioning.
 */

const baseButtonStyles =
  "cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60";

export const adminButtonStyles = {
  // Primary actions: Create, Add, Upload, Save, etc.
  primary:
    `${baseButtonStyles} bg-black hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-600 disabled:hover:bg-gray-300`,

  // Destructive actions: Delete, Remove, etc.
  danger:
    `${baseButtonStyles} bg-red-500 hover:bg-red-600 disabled:bg-gray-300 disabled:text-gray-600 disabled:hover:bg-gray-300`,

  // Secondary actions: Cancel, Back, etc.
  secondary:
    `${baseButtonStyles} bg-gray-400 hover:bg-gray-500 disabled:bg-gray-300 disabled:hover:bg-gray-300`,
} as const;
