This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Square ordering rules

The Square client explicitly uses API version `2026-08-19` (SDK 45.1.0 or later),
which exposes nested modifier relationships. Keep this version and the behavior
in `app/lib/square-option-rules.ts` aligned when upgrading Square. Catalog list
reads, fresh customizer reads, and checkout all resolve the same per-item rules.

The supported catalog uses list modifiers with effective `allow_quantities`
disabled. Enabled groups with repeated quantities, text modifiers, or nested
modifiers block online ordering and display an actionable reason in the admin
menu's Availability column. Disable the group on that drink or correct its
configuration in Square Dashboard to restore ordering.

Omitted per-item limits default to `-1`; both limits must be `-1` to inherit the
group's bounds. Otherwise nonpositive bounds normalize to zero (optional for the
minimum, unlimited for the maximum). Deprecated `selection_type` never makes a
group required. Defaults and online visibility use Square's per-option overrides.
See Square's [item modifier rules](https://developer.squareup.com/reference/square/objects/CatalogItemModifierListInfo)
and [nested modifier guide](https://developer.squareup.com/docs/catalog-api/manage-nested-modifiers).

Checkout lines must include the parent `catalogObjectId`, selected `variationId`,
and `modifierOptionIds`. The server checks current membership and limits before
creating a Payment Link; the resulting Square Order still uses the variation ID
as its line item's catalog object ID. Run `npm test` for the rule, availability,
catalog-response, and checkout regression tests.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
