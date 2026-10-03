import Image from "next/image";
import { listActiveEvents } from "@/app/lib/queries/events";

const fallbackImage = "/admin_icons/admin_svg/teazo_dash_icon.svg";

export default async function ActiveEvents() {
  let events;
  try {
    events = await listActiveEvents();
  } catch {
    return null;
  }
  if (events.length === 0) return null;

  return (
    <section className="relative z-10 mx-auto mt-10 w-[calc(100%-2rem)] max-w-[1100px]" aria-labelledby="active-events-heading">
      <div className="mb-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b98555]">What&apos;s happening</p>
        <h2 id="active-events-heading" className="mt-2 text-4xl font-bold text-[#374151]">Current events</h2>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <article key={event.id} className="overflow-hidden rounded-2xl border border-[#e9dbd5] bg-white shadow-sm">
            <div className="relative aspect-[4/3] bg-[#f3ece6]">
              <Image
                src={event.imageUrl || fallbackImage}
                alt={event.name}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover"
              />
            </div>
            <div className="p-5">
              <h3 className="text-xl font-semibold text-gray-900">{event.name}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{event.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
