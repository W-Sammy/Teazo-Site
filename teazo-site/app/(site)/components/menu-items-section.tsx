import MenuItemCard, { type MenuItem } from "./menu-item-card";

type MenuItemsSectionProps = {
	title: string;
	subtitle?: string;
	items: MenuItem[];
	className?: string;
	headingClassName: string;
	bodyClassName: string;
};

/* Shared section renderer for menu item groups.
   It displays the heading/subtitle and then maps each item
   into the reusable MenuItemCard component. */
export default function MenuItemsSection({
	title,
	subtitle,
	items,
	className = "",
	headingClassName,
	bodyClassName,
}: MenuItemsSectionProps) {
	return (
		<section
			className={`rounded-[28px] bg-white px-5 py-6 shadow-sm sm:px-6 sm:py-7 lg:px-8 lg:py-8 ${className}`}
		>
			<div className="mb-6 flex flex-col items-center justify-center text-center">
				<h3
					className={`${headingClassName} text-[2.2rem] uppercase leading-[0.95] tracking-[0.04em] text-[#d9ab79] sm:text-[2.6rem]`}
				>
					{title}
				</h3>

				{subtitle && (
					<p
						className={`${bodyClassName} mt-3 max-w-3xl text-base leading-7 text-stone-700 sm:text-lg`}
					>
						{subtitle}
					</p>
				)}
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{items.map((item) => (
					<MenuItemCard key={item.catalogObjectId} item={item} />
				))}
			</div>
		</section>
	);
}