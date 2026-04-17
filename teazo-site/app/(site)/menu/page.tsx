import type { Metadata } from "next";
import Image from "next/image";
import { Cabin_Sketch, Montserrat } from "next/font/google";
import MenuItemCard, { type MenuItem } from "../components/menu-item-card";
import { BubbleField } from "@/app/components/bubble-field";
import GeneralButton from "@/app/components/general-button";

export const metadata: Metadata = {
	title: "Menu",
	description: "Explore TEAZO menu categories and featured specials.",
};

const cabinSketch = Cabin_Sketch({
	subsets: ["latin"],
	weight: ["700"],
});

const montserrat = Montserrat({
	subsets: ["latin"],
	weight: ["400", "700"],
});

// Decorative pink underline behind the section heading.
function PaintStroke() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 900 230"
      className="absolute left-1/2 top-1/2 h-[120px] w-[680px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2"
    >
      <path
        d="M70 120C180 74 250 134 364 104c80-20 118-45 222-28 72 12 126 34 214 16"
        fill="none"
        stroke="#ffafc4"
        strokeLinecap="round"
        strokeWidth="26"
      />
      <path
        d="M106 152c78-50 158-14 243-36 104-27 177-88 333-58"
        fill="none"
        stroke="#ffbfd0"
        strokeLinecap="round"
        strokeWidth="24"
      />
      <path
        d="M274 80c64-10 146 24 204 10 94-22 149-12 234 14"
        fill="none"
        stroke="#ff9eb9"
        strokeLinecap="round"
        strokeWidth="20"
      />
    </svg>
  );
}

/* Structure used to group menu items into named categories.
   Each section can optionally include a subtitle plus a list of items
   rendered through the reusable MenuItemCard component. */
type MenuSection = {
  title: string;
  subtitle?: string;
  items: MenuItem[];
};

/* Creates mock menu items in a shape that closely matches the expected
   backend/Square API response. This will make it easy to migrate later
   when real data is connected through the products endpoint. */
function createMenuItem(
  categoryId: string,
  categoryName: string,
  name: string,
  priceCents: number,
  description?: string,
  imageUrl: string | null = "/TEAZO_logo.png"
): MenuItem {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    catalogObjectId: `mock-${categoryId}-${slug}`,
    name,
    variationId: null,
    priceCents,
    currency: "USD",
    imageUrl,
    categoryId,
    categoryName,
    description,
  };
}

/* Featured/special items shown near the top of the page before the full
   category list. These are currently mocked from the client’s Square site
   and can be replaced later with API-driven data. */
const specials: MenuItem[] = [
  createMenuItem(
    "specials",
    "TEAZO Special",
    "Chocolate Truffle (8pc)",
    675,
    "House made chocolate truffles are artisan confections made with care, that features a smooth, creamy chocolate ganache center that melts in your mouth surrounded by a delicious and delicate coat of chocolate powder.",
    "/menu_items/chocolate_truffle.webp"
  ),
  createMenuItem(
    "specials",
    "TEAZO Special",
    "Sesame Mochi Latte",
    725,
    "The delightful beverage combines the rich, nutty essence of toasted sesame with the chewy texture of house made milk mochi and cream milk."
  ),
  createMenuItem(
    "specials",
    "TEAZO Special",
    "Matcha Sesame Cheezo",
    725,
    "A world where rich matcha meets the nutty goodness of house made sesame cheezo.",
  ),
  createMenuItem(
    "specials",
    "TEAZO Special",
    "Sesame Cheezo Latte",
    725,
    "A rich, creamy latte infused with the nutty goodness of toasted sesame and topped with a dreamy layer of sesame cheezo."
  ),
  createMenuItem(
    "specials",
    "TEAZO Special",
    "Brown Sugar Fluffy Coffee",
    725,
    "Our creamy brown sugar latte and a fluffy coffee cream to top it off. Perfect for you coffee lovers!(Dairy)",
    "/menu_items/brown_sugar_fluffy_coffee.webp"
  ),
  createMenuItem(
    "specials",
    "TEAZO Special",
    "Strawberry Tea",
    675,
    "Homemade strawberry jelly with fresh strawberry puree and four season tea.",
    "/menu_items/strawberry_tea.webp"
  ),
  createMenuItem(
    "specials",
    "TEAZO Special",
    "Strawberry Jelly Latte",
    675,
    "Homemade strawberry jelly with creamy milk.",
    "/menu_items/strawberry_jelly_latte.webp"
  ),
  createMenuItem(
    "specials",
    "TEAZO Special",
    "Creme Brulee Boba Milk Tea 厚烧蛋糕波波奶茶",
    750,
    "MUST TRY! A signature boba milk tea with a layer of torched brown sugar cream on top. Boba and Crystal Boba are included. Regular cup only.",
    "/menu_items/creme_brulee_boba_milk_tea.webp"
  ),
  createMenuItem(
    "specials",
    "TEAZO Special",
    "Creme Brulee Brown Sugar Boba Latte 厚烧蛋糕黑糖鲜奶",
    750,
    "A signature brown sugar boba latte with a layer of torched brown sugar cream on top. Boba is included. Regular cup only.",
    "/menu_items/creme_brulee_brown_sugar_boba_latte.webp"
  ),
];

/* Main category data for the menu page.
   Product names, prices, and descriptions are currently based on the
   client’s existing Square menu, while image URLs remain placeholders
   until the final image/data mapping is completed. */
const menuSections: MenuSection[] = [
  {
    title: "Japanese Soufflé Pancake",
    subtitle: "Think cottony clouds of heaven that melt in your mouth",
    items: [
      createMenuItem(
        "souffle-pancake",
        "Japanese Soufflé Pancake",
        "Crème Brûlée Soufflé",
        1299,
        "A light, fluffy Japanese soufflé with a layer of crispy torched brown sugar on top.",
        "/menu_items/creme_brulee_souffle.webp"
      ),
      createMenuItem(
        "souffle-pancake",
        "Japanese Soufflé Pancake",
        "Sea Salt Seaweed Pork Floss Soufflé",
        1399,
        "A Japanese style soufflé pancake with salted pork floss on top.",
        "/menu_items/sea_salt_seaweed_pork_floss_souffle.webp"
      ),
      createMenuItem(
        "souffle-pancake",
        "Japanese Soufflé Pancake",
        "Strawberry Soufflé",
        1299,
        "Light and fluffy soufflé pancake with a smooth strawberry cream to finish.",
        "/menu_items/strawberry_souffle.webp"
      ),
      createMenuItem(
        "souffle-pancake",
        "Japanese Soufflé Pancake",
        "Matcha Soufflé",
        1299,
        "Light and fluffy soufflé pancake with a smooth matcha cream to finish.",
        "/menu_items/matcha_souffle.webp"
      ),
      createMenuItem( 
        "souffle-pancake",
        "Japanese Soufflé Pancake",
        "Chocolate Soufflé",
        1299,
        "Light and fluffy soufflé pancake with a smooth chocolate cream to finish.",
        "/menu_items/chocolate_souffle.webp"
      ),
    ],
  },
  {
    title: "Tiramisu Cheezo",
    items: [
      createMenuItem(
        "tiramisu-cheezo",
        "Tiramisu Cheezo",
        "Tiramisu Milk Tea",
        650,
        "Signature Teazo milk tea topped with a strong and creamy layer of tiramisu cheezo.",
        "/menu_items/tiramisu_milk_tea.webp"
      ),
      createMenuItem(
        "tiramisu-cheezo",
        "Tiramisu Cheezo",
        "Tiramisu Oolong Tea",
        650,
        "High mountain oolong tea topped with a strong and creamy layer of tiramisu cheezo.",
        "/menu_items/tiramisu_oolong_tea.webp"
      ),
      createMenuItem(
        "tiramisu-cheezo",
        "Tiramisu Cheezo",
        "Tiramisu Matcha Latte",
        650,
        "Matcha latte topped with a strong and creamy layer of tiramisu cheezo.",
        "/menu_items/tiramisu_matcha_latte.webp"
      ),
    ],
  },
  {
    title: "Cheezo Tea",
    subtitle: "Fresh brewed premium tea with salty cheese cream",
    items: [
      createMenuItem(
        "cheezo-tea",
        "Cheezo Tea",
        "Black Jade Tea",
        600,
        "Black Jade Tea top with sea salt cheezo cream. Cheezo included. (Black Jade Tea 【红玉红茶】 is a hybrid of the Assam tea plant and the wild tea tree that grows naturally in the mountain forests of Taiwan)",
        "/menu_items/black_jade_tea.webp"
      ),
      createMenuItem(
        "cheezo-tea",
        "Cheezo Tea",
        "Jasmine Tea",
        600,
        "Jasmine Tea top with sea salt cheezo cream. Cheezo cream included.",
        "/menu_items/jasmine_tea.webp"
      ),
      createMenuItem(
        "cheezo-tea",
        "Cheezo Tea",
        "Earl Grey Tea",
        600,
        "Earl Grey Black Tea top with sea salt cheezo cream. Cheezo included",
        "/menu_items/earl_grey_tea.webp"
      ),
      createMenuItem(
        "cheezo-tea",
        "Cheezo Tea",
        "Four Season Tea",
        600,
        "Four season tea top with sea salt cheezo cream. (Four Season tea is a high-mountain tea which has been hand-picked and hand-processed by traditional methods. It is an excellent daily tea with a smooth sweet taste and pleasing color)",
        "/menu_items/four_season_tea.webp"
      ),
      createMenuItem(
        "cheezo-tea",
        "Cheezo Tea",
        "Oolong Tea",
        600,
        "High mountain oolong tea topped with sea salt cheezo cream. Cheezo cream included.",
        "/menu_items/oolong_tea.webp"
      ),
    ],
  },
  {
    title: "Milk Tea",
    items: [
      createMenuItem(
        "milk-tea",
        "Milk Tea",
        "Creme Brulee Boba Milk Tea 厚烧蛋糕波波奶茶",
        750,
        "MUST TRY! A signature boba milk tea with a layer of torched brown sugar cream on top. Boba and Crystal Boba are included. Regular cup only.",
        "/menu_items/creme_brulee_boba_milk_tea.webp"
      ),
      createMenuItem(
        "milk-tea",
        "Milk Tea",
        "Boba Milk Tea",
        650,
        "Signature house BOBA milk tea, Boba included. Dairy free.",
        "/menu_items/boba_milk_tea.webp"
      ),
      createMenuItem(
        "milk-tea",
        "Milk Tea",
        "Jasmine Milk Tea",
        600,
        "A traditional Jasmine Milk Tea with an amazing scentful smell of flowers.",
        "/menu_items/jasmine_milk_tea.webp"
      ),
      createMenuItem(
        "milk-tea",
        "Milk Tea",
        "Earl Grey Milk Tea",
        600,
        "A Classic Earl Grey tea with milk.",
        "/menu_items/earl_grey_milk_tea.webp"
      ),
      createMenuItem(
        "milk-tea",
        "Milk Tea",
        "Oolong Milk Tea",
        600,
        "High mountain premium oolong tea with milk.",
        "/menu_items/oolong_milk_tea.webp"
      ),
      createMenuItem(
        "milk-tea",
        "Milk Tea",
        "Oreo Milk Tea",
        650,
        "A signature milk tea twisted with puff cream and topped with crushed Oreo.",
        "/menu_items/oreo_milk_tea.webp"
      ),
      createMenuItem(
        "milk-tea",
        "Milk Tea",
        "Puff Cream Milk Tea",
        650,
        "A signature milk tea twisted with puff cream.",
        "/menu_items/puff_cream_milk_tea.webp"
      ),
      createMenuItem(
        "milk-tea",
        "Milk Tea",
        "Taro Milk Tea",
        600,
        "Strong taro taste with milk. (Caffeine free.)",
        "/menu_items/taro_milk_tea.webp"
      ),
      createMenuItem(
        "milk-tea", 
        "Milk Tea", 
        "Thai Tea", 
        600,
        "",
        "/menu_items/thai_tea.webp"),
    ],
  },
  {
    title: "Fresh Fruit Tea",
    items: [
      createMenuItem(
        "fresh-fruit-tea",
        "Fresh Fruit Tea",
        "Very Berry Cheezo",
        799,
        "A blended tea slush made of fresh strawberries, top with sea salt cheezo cream. Cheezo included (Cold and Large Cup Only) We don't recommend light sweet and light ice.",
        "/menu_items/very_berry_cheezo.webp"
      ),
      createMenuItem(
        "fresh-fruit-tea",
        "Fresh Fruit Tea",
        "Mango Cheezo",
        799,
        "A blended tea slush made of fresh mango, top with sea salt cheezo cream. Cheezo included (Cold and Large Cup Only) We don't recommend light sweet and light ice.",
        "/menu_items/mango_cheezo.webp"
      ),
      createMenuItem(
        "fresh-fruit-tea",
        "Fresh Fruit Tea",
        "Berry Bang Cheezo",
        799,
        "A blended tea slush made of fresh strawberries and blues, top with sea salt cheezo cream. Cheezo included (Cold and Large Cup Only) We don't recommend light sweet and light ice.",
        "/menu_items/berry_bang_cheezo.webp"
      ),
      createMenuItem(
        "fresh-fruit-tea",
        "Fresh Fruit Tea",
        "Mango Coco",
        799,
        "A blended tea slush made of fresh mango with a top of creamy coconut milk to finish it off. Crystal boba included (Cold and Large Cup Only.) We don't recommend light sweet and light ice.",
        "/menu_items/mango_coco.webp"
      ),
      createMenuItem(
        "fresh-fruit-tea",
        "Fresh Fruit Tea",
        "Super Fruit Tea",
        799,
        "Fresh mix fruit with choice of tea. (Large cup only) We don't recommend light sweet and light ice.",
        "/menu_items/super_fruit_tea.webp"
      ),
      createMenuItem(
        "fresh-fruit-tea",
        "Fresh Fruit Tea",
        "Super Orange Tea",
        725,
        "Fresh orange and lime with choice of tea. (Large Cup Only) We don't recommend light sweet and light ice.",
        "/menu_items/super_orange_tea.webp"
      ),
      createMenuItem(
        "fresh-fruit-tea",
        "Fresh Fruit Tea",
        "Super Lemon Tea",
        725,
        "Freshly squeezed lemon and lime with any choice of tea. Recommended regular sweetness and ice, please enjoy it within 1 hour for the best taste. (Large Cup Only) We don't recommend light sweet and light ice.",
        "/menu_items/super_lemon_tea.webp"
      ),
      createMenuItem(
        "fresh-fruit-tea",
        "Fresh Fruit Tea",
        "Passion Pineapple Tea",
        725,
        "Fresh pineapple and passionfruit with four season tea. (Large cup only) We don't recommend light sweet and light ice.",
        "/menu_items/passion_pineapple_tea.webp"
      ),
      createMenuItem(
        "fresh-fruit-tea",
        "Fresh Fruit Tea",
        "PassionFruit Orange Tea",
        725,
        "Fresh orange and passionfruit with choice of tea. (Large cup only) We don't recommend light sweet and light ice.",
        "/menu_items/passionfruit_orange_tea.webp"
      ),
      createMenuItem(
        "fresh-fruit-tea",
        "Fresh Fruit Tea",
        "Passionfruit Lemon Tea",
        725,
        "Fresh lemon, lime and passionfruit with choice of tea. (Large cup only) We don't recommend light sweet and light ice.",
        "/menu_items/passionfruit_lemon_tea.webp"
      ),
    ],
  },
  {
    title: "Matcha",
    items: [
      createMenuItem(
        "matcha",
        "Matcha",
        "Mango Matcha Cheezo",
        699,
        "A beautiful three layer drink with mango flavor on the bottom, milk in the middle, and a amazing matcha cheezo on the top.",
        "/menu_items/mango_matcha_cheezo.webp"
      ),
      createMenuItem(
        "matcha",
        "Matcha",
        "Strawberry Matcha Cheezo",
        699,
        "A beautiful three layer drink with strawberry flavor on the bottom, milk in the middle, and a amazing matcha cheezo on the top.",
        "/menu_items/strawberry_matcha_cheezo.webp"
      ),
      createMenuItem(
        "matcha",
        "Matcha",
        "Matcha Latte",
        699,
        "A layered premium matcha with whole milk.",
        "/menu_items/matcha_latte.webp"
      ),
      createMenuItem(
        "matcha",
        "Matcha",
        "Matcha Slush",
        625,
        "A ice cold matcha slush made freshly. (Cold only)",
        "/menu_items/matcha_slush.webp"
      ),
      createMenuItem(
        "matcha",
        "Matcha",
        "Oreo Brulee Matcha",
        699,
        "A matcha slush twisted with puff cream and topped with crushed Oreo. (Cold only)",
        "/menu_items/oreo_brulee_matcha.webp"
      ),
    ],
  },
  {
    title: "Caffeine Free Drink",
    items: [
      createMenuItem(
        "caffeine-free-drink",
        "Caffeine Free Drink",
        "Brown Sugar Boba Latte",
        699,
        "Signature brown sugar Boba with creamy milk, Boba included. (Dairy)",
        "/menu_items/brown_sugar_boba_latte.webp"
      ),
      createMenuItem(
        "caffeine-free-drink",
        "Caffeine Free Drink",
        "Creme Brulee Brown Sugar Boba Latte 厚烧蛋糕黑糖鲜奶",
        750,
        "A signature brown sugar boba latte with a layer of torched brown sugar cream on top. Boba is included. Regular cup only.",
        "/menu_items/creme_brulee_brown_sugar_boba_latte.webp"
      ),
      createMenuItem(
        "caffeine-free-drink",
        "Caffeine Free Drink",
        "Avocado Smash",
        725,
        "Fresh Avocado blended with ice and non dairy milk. Creamy and Healthy. (Cold only)",
        "/menu_items/avocado_smash.webp"
      ),
      createMenuItem(
        "caffeine-free-drink",
        "Caffeine Free Drink",
        "Banana berry Snow",
        625,
        "Fresh banana blended with strawberry puree, ice and milk. (Cold only)",
        "/menu_items/banana_berry_snow.webp"
      ),
      createMenuItem(
        "caffeine-free-drink",
        "Caffeine Free Drink",
        "Oreo Smoothie",
        625,
        "A ice cold Oreo Smoothie.",
        "/menu_items/oreo_smoothie.webp"
      ),
      createMenuItem(
        "caffeine-free-drink",
        "Caffeine Free Drink",
        "Peach Yogurt",
        600,
        "Peach flavored yogurt drink.",
        "/menu_items/peach_yogurt.webp"
      ),
      createMenuItem(
        "caffeine-free-drink",
        "Caffeine Free Drink",
        "Strawberry Fizz",
        600,
        "Fresh strawberry puree flavor with sparkling water.",
        "/menu_items/strawberry_fizz.webp"
      ),
      createMenuItem(
        "caffeine-free-drink",
        "Caffeine Free Drink",
        "Watermelon Slush",
        625,
        "Fresh watermelon blended with ice.",
        "/menu_items/watermelon_slush.webp"
      ),
      createMenuItem(
        "caffeine-free-drink", 
        "Caffeine Free Drink", 
        "Perrier", 
        300,
        "",
        "/menu_items/perrier.webp"
      ),
    ],
  },
  {
    title: "Dessert & Cake",
    items: [
      createMenuItem(
        "dessert-cake",
        "Dessert & Cake",
        "Brown Sugar Mochi (6pc)",
        800,
        "Its crispy, chewy texture and a rich caramel-like flavor from the brown sugar, dusted with soy powder.",
        "/menu_items/brown_sugar_mochi.webp"
      ),
      createMenuItem(
        "dessert-cake",
        "Dessert & Cake",
        "Chocolate Truffle (8pc)",
        675,
        "House made chocolate truffles are artisan confections made with care, that features a smooth, creamy chocolate ganache center that melts in your mouth surrounded by a delicious and delicate coat of chocolate powder.",
        "/menu_items/chocolate_truffle.webp"
      ),
      createMenuItem(
        "dessert-cake", 
        "Dessert & Cake", 
        "Tiramisu Cup", 
        675,
        "",
        "/menu_items/tiramisu_cup.webp"),
      createMenuItem(
        "dessert-cake",
        "Dessert & Cake",
        "Tiramisu cake",
        1299,
        "A housemade rich and smooth mascarpone cream between layers of soaked sponge with coffee, dusted with cocoa powder. (No alcohol)",
        "/menu_items/tiramisu_cake.webp"
      ),
      createMenuItem(
        "dessert-cake",
        "Dessert & Cake",
        "Matchamisu cake",
        1299,
        "A rich and smooth mascarpone cream between layers of soaked Ladyfingers with matcha and dusted with matcha powder. (Housemade, No alcohol)",
        "/menu_items/matchamisu_cake.webp"
      ),
      createMenuItem(
        "dessert-cake",
        "Dessert & Cake",
        "Salty Caramelmisu Cake",
        1299,
        "A housemade rich and smooth salty mascarpone cream between layers of soaked Ladyfingers with coffee, dusted with caramel crunch. (No alcohol)",
        "/menu_items/salty_caramelmisu_cake.webp"
      ),
      createMenuItem(
        "dessert-cake",
        "Dessert & Cake",
        "Salty Soymilkmisu Cake",
        1299,
        "A housemade rich and smooth salty mascarpone cream between layers of soaked Ladyfingers with soymilk, dusted with soy powder. (No alcohol)",
        "/menu_items/salty_soymilkmisu_cake.webp"
      ),
    ],
  },
  {
    title: "Snack",
    items: [
      createMenuItem(
        "snack",
        "Snack",
        "Crispy Popcorn Chicken (Spicy)",
        999,
        "",
        "/menu_items/crispy_popcorn_chicken.webp"
      ),
      createMenuItem(
        "snack", 
        "Snack", 
        "Fried Chicken Wing (Spicy)", 
        900,
        "",
        "/menu_items/fried_chicken_wing.webp"
      ),
      createMenuItem(
        "snack",
        "Snack",
        "TAKOYAKI",
        999,
        "A ball shaped traditional Japanese snack. The balls are brushed with Takoyaki sauce and mayonnaise, and then sprinkled with shavings of dried bonito.",
        "/menu_items/takoyaki.webp"
      ),
      createMenuItem(
        "snack",
        "Snack",
        "Fried Mini Octopus",
        900,
        "A very crispy snack with a delightful taste.",
        "/menu_items/fried_mini_octopus.webp"
      ),
      createMenuItem(
        "snack", 
        "Snack", 
        "Curly Fries", 
        725,
        "",
        "/menu_items/curly_fries.webp"
        ),
      createMenuItem(
        "snack",
        "Snack",
        "Fried Cheese Stick",
        700,
        "A crispy fried mozzarella cheese stick. (Recommended to enjoy while it's hot.)",
        "/menu_items/fried_cheese_stick.webp"
      ),
      createMenuItem(
        "snack",
        "Snack",
        "Fried Tofu",
        800,
        "A great and enjoyable snack for everyone.",
        "/menu_items/fried_tofu.webp"
      ),
      createMenuItem(
        "snack", 
        "Snack", 
        "Spam Musubi", 
        775,
        "",
        "/menu_items/spam_musubi.webp"
        ),
      createMenuItem(
        "snack",
        "Snack",
        "Pork Floss Spam Musubi",
        800,
        "Pork Floss Spam Musubi",
        "/menu_items/pork_floss_spam_musubi.webp"
      ),
    ],
  },
];

/* Shared section renderer for one menu category.
   It displays the category heading/subtitle and then maps each item
   in the section into the reusable MenuItemCard component. */
function MenuCategorySection({ section }: { section: MenuSection }) {
  return (
    <section className="rounded-[28px] bg-white px-5 py-6 shadow-sm sm:px-6 sm:py-7 lg:px-8 lg:py-8">
      <div className="mb-6 flex flex-col items-center justify-center text-center">
        <h3
          className={`${cabinSketch.className} text-[2.2rem] uppercase leading-[0.95] tracking-[0.04em] text-[#d9ab79] sm:text-[2.6rem]`}
        >
          {section.title}
        </h3>

        {section.subtitle && (
          <p
            className={`${montserrat.className} mt-3 max-w-3xl text-base leading-7 text-stone-700 sm:text-lg`}
          >
            {section.subtitle}
          </p>
        )}
      </div>

      {/* The grid shifts from one column to two columns on larger screens
          so the category layout remains readable on both mobile and desktop. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {section.items.map((item) => (
          <MenuItemCard key={item.catalogObjectId} item={item} />
        ))}
      </div>
    </section>
  );
}

/* Separate section for TEAZO featured specials.
   This keeps specials visually distinct from the standard menu categories
   while still reusing the same menu card component for consistency. */
function SpecialsSection() {
  return (
    <section className="mx-auto mt-16 max-w-[1320px] rounded-[28px] bg-white px-5 py-6 shadow-sm sm:px-6 sm:py-7 lg:mt-20 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-center justify-center text-center">
        <h3
          className={`${cabinSketch.className} text-[2.2rem] uppercase leading-[0.95] tracking-[0.04em] text-[#d9ab79] sm:text-[2.6rem]`}
        >
          TEAZO Special
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {specials.map((item) => (
          <MenuItemCard key={item.catalogObjectId} item={item} />
        ))}
      </div>
    </section>
  );
}

export default function MenuPage() {
	return (
		<main className="relative isolate min-h-screen bg-[#f4efeb] text-stone-900">
			<div className="pointer-events-none absolute inset-0 overflow-hidden">
				<BubbleField count={52} />
			</div>

			<div className="pointer-events-none absolute inset-x-0 top-0 h-[720px] overflow-hidden sm:h-[780px] lg:h-[860px]">
				<BubbleField count={13} />
			</div>

			<div className="relative z-10 mx-auto max-w-[1440px] px-5 pb-24 pt-28 sm:px-8 sm:pt-32 lg:px-10 lg:pt-36">
				<section className="flex flex-col items-center text-center">
					<Image
						src="/TEAZO_logo.png"
						alt=""
						aria-hidden="true"
						width={389}
						height={397}
						className="h-[170px] w-auto sm:h-[195px]"
						priority
					/>

					<h1
						className={`${cabinSketch.className} mt-4 text-[3.8rem] uppercase leading-[0.9] tracking-[0.08em] text-[#d9ab79] sm:text-[5.1rem]`}
					>
						Menu
					</h1>

					<div className="mt-10 flex flex-col items-center sm:mt-12">
						<p
							className={`${montserrat.className} text-[1.35rem] font-medium uppercase tracking-[0.18em] text-[#161616] sm:text-[1.55rem]`}
>
							Too Much Scrolling?
						</p>

						<p
							className={`${montserrat.className} mt-2 text-[2rem] font-bold uppercase tracking-[0.06em] text-[#161616] sm:text-[2.5rem]`}
>
							Download Our Menu
						</p>

						<div className="mt-8">
							<GeneralButton text="DOWNLOAD" href="/static-menu" />
						</div>
					</div>

					<div className="relative mt-16 inline-flex items-center justify-center sm:mt-20">
						<PaintStroke />
						<h2
							className={`${cabinSketch.className} relative z-10 px-5 text-center text-[3.1rem] uppercase leading-[0.92] tracking-[0.035em] text-[#161616] sm:text-[4.5rem] lg:text-[5rem]`}
						>
							Drinks, Desserts &amp; Specials
						</h2>
					</div>

					<p
						className={`${montserrat.className} mt-8 max-w-3xl text-base leading-7 text-stone-700 sm:text-lg`}
					>
						Explore TEAZO menu categories and featured specials.
					</p>
				</section>

				<SpecialsSection />

				<div className="mx-auto mt-16 grid max-w-[1320px] grid-cols-1 gap-6 lg:mt-20 lg:gap-8">
					{menuSections.map((section) => (
						<MenuCategorySection key={section.title} section={section} />
					))}
				</div>
			</div>
		</main>
	);
}