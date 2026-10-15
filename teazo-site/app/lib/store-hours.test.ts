import { describe, expect, it } from "vitest";
import type { WebsiteContent } from "@/app/types/website-content";
import {
  getAvailablePickupSlots,
  getPickupDays,
  getStoreScheduleForDate,
  getWeeklyCustomerHours,
  pacificToUtc,
  validatePickupTiming,
} from "@/app/lib/store-hours";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Open 11:00 AM to 8:00 PM every day except Monday. */
function makeContent(overrides: Partial<WebsiteContent> = {}): WebsiteContent {
  return {
    logo: "/TEAZO_logo.svg",
    story: "",
    socialLinks: [],
    address: {
      businessName: "TEAZO",
      streetAddress: "1050 Taraval St",
      locality: "San Francisco, CA 94116",
      phone: "",
      email: "",
    },
    hours: DAYS.map((day) => ({ day, start: 11, end: 20, closed: day === "Mon" })),
    holidays: [
      { id: "xmas", name: "Christmas", date: "12-25", closed: true },
      { id: "half", name: "Half day", date: "10-16", closed: false, start: 11, end: 14 },
    ],
    contactFormEnabled: true,
    ...overrides,
  };
}

/** A moment in San Francisco time. October 14, 2026 is a Wednesday. */
const pt = (month: number, day: number, hour: number, minute = 0, year = 2026) =>
  pacificToUtc(year, month, day, hour, minute);

const ptTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  });

describe("ASAP pickup", () => {
  const content = makeContent();
  const asap = (now: Date) => validatePickupTiming({ type: "ASAP" }, { content, referenceNow: now });

  it("is refused before opening", async () => {
    expect((await asap(pt(10, 14, 10, 59))).valid).toBe(false);
  });

  it("is accepted from opening through the cutoff 30 minutes before closing", async () => {
    expect((await asap(pt(10, 14, 11, 0))).valid).toBe(true);
    expect((await asap(pt(10, 14, 19, 30))).valid).toBe(true);
  });

  it("is refused after the cutoff", async () => {
    const result = await asap(pt(10, 14, 19, 31));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("7:30 PM");
  });

  it("is refused on a closed weekday and on a closed holiday", async () => {
    expect((await asap(pt(10, 19, 12, 0))).valid).toBe(false);
    const christmas = await asap(pt(12, 25, 12, 0));
    expect(christmas.valid).toBe(false);
    expect(christmas.error).toContain("Christmas");
  });

  it("uses a holiday's adjusted hours", async () => {
    expect((await asap(pt(10, 16, 13, 30))).valid).toBe(true);
    expect((await asap(pt(10, 16, 13, 45))).valid).toBe(false);
  });

  it("returns a pickup time 25 minutes out", async () => {
    const now = pt(10, 14, 15, 0);
    const result = await asap(now);
    expect(result.pickupTimeIsoUtc).toBe(new Date(now.getTime() + 25 * 60_000).toISOString());
  });
});

describe("pickup slots", () => {
  const content = makeContent();

  it("start 25 minutes out, rounded up to the quarter hour, and end at the cutoff", () => {
    const slots = getAvailablePickupSlots(content, pt(10, 14, 15, 2));
    expect(ptTime(slots[0])).toBe("3:30 PM");
    expect(ptTime(slots[slots.length - 1])).toBe("7:30 PM");
    expect(slots).toHaveLength(17);
  });

  it("are empty once no slot fits before the cutoff", () => {
    expect(getAvailablePickupSlots(content, pt(10, 14, 19, 24))).toEqual([]);
  });

  it("stay on the right wall-clock times on the day daylight saving ends", () => {
    const slots = getAvailablePickupSlots(content, pt(11, 1, 11, 0));
    expect(ptTime(slots[0])).toBe("11:30 AM");
    expect(ptTime(slots[slots.length - 1])).toBe("7:30 PM");
  });
});

describe("scheduled pickup", () => {
  const content = makeContent();
  const now = pt(10, 14, 15, 2);
  const scheduled = (pickupAt: string) =>
    validatePickupTiming({ type: "SCHEDULED", pickupAt }, { content, referenceNow: now });

  it("accepts every offered slot", async () => {
    for (const slot of getAvailablePickupSlots(content, now)) {
      expect((await scheduled(slot)).valid).toBe(true);
    }
  });

  it("refuses times inside the prep window, after the cutoff, and garbage", async () => {
    expect((await scheduled(pt(10, 14, 15, 10).toISOString())).valid).toBe(false);
    expect((await scheduled(pt(10, 14, 19, 45).toISOString())).valid).toBe(false);
    expect((await scheduled("not a date")).valid).toBe(false);
  });
});

describe("scheduling ahead (TZ-435)", () => {
  const content = makeContent();
  const scheduledAt = (pickup: Date, now: Date) =>
    validatePickupTiming({ type: "SCHEDULED", pickupAt: pickup.toISOString() }, { content, referenceNow: now });

  it("offers the next 7 days with slots, skipping closed days, once today is over", () => {
    // Wednesday Oct 14 at 7:24 PM, past the last slot today
    const days = getPickupDays(content, pt(10, 14, 19, 24));
    expect(days.map((d) => d.date)).toEqual([
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
      // Monday Oct 19 is closed
      "2026-10-20",
      "2026-10-21",
    ]);
    expect(days.map((d) => d.label).slice(0, 3)).toEqual(["Tomorrow", "Fri, Oct 16", "Sat, Oct 17"]);
  });

  it("gives a future day's slots from opening to the cutoff, and a holiday's adjusted hours", () => {
    const days = getPickupDays(content, pt(10, 14, 19, 24));
    const thursday = days[0].slots;
    expect(ptTime(thursday[0])).toBe("11:00 AM");
    expect(ptTime(thursday[thursday.length - 1])).toBe("7:30 PM");
    const halfDay = days[1].slots;
    expect(ptTime(halfDay[halfDay.length - 1])).toBe("1:30 PM");
  });

  it("starts with today while today still has slots", () => {
    const days = getPickupDays(content, pt(10, 14, 15, 2));
    expect(days[0]).toMatchObject({ date: "2026-10-14", label: "Today" });
    expect(ptTime(days[0].slots[0])).toBe("3:30 PM");
  });

  it("keeps wall-clock times across the daylight saving change", () => {
    const days = getPickupDays(content, pt(10, 30, 12, 0));
    const nov1 = days.find((d) => d.date === "2026-11-01");
    expect(nov1 && ptTime(nov1.slots[0])).toBe("11:00 AM");
    expect(nov1 && ptTime(nov1.slots[nov1.slots.length - 1])).toBe("7:30 PM");
  });

  it("accepts every offered slot on every offered day", async () => {
    const now = pt(10, 14, 15, 2);
    for (const day of getPickupDays(content, now)) {
      for (const slot of day.slots) {
        const result = await validatePickupTiming({ type: "SCHEDULED", pickupAt: slot }, { content, referenceNow: now });
        expect(result.valid, `${day.date} ${slot}`).toBe(true);
      }
    }
  });

  it("refuses a day more than 7 days ahead, a past day, a closed day, and a closed holiday", async () => {
    const now = pt(10, 14, 15, 0);
    expect((await scheduledAt(pt(10, 21, 12, 0), now)).valid).toBe(true);
    expect((await scheduledAt(pt(10, 22, 12, 0), now)).valid).toBe(false);
    expect((await scheduledAt(pt(10, 13, 12, 0), now)).valid).toBe(false);
    const monday = await scheduledAt(pt(10, 19, 12, 0), now);
    expect(monday.valid).toBe(false);
    expect(monday.error).toContain("closed");
    const christmas = await scheduledAt(pt(12, 25, 12, 0), pt(12, 20, 12, 0));
    expect(christmas.valid).toBe(false);
    expect(christmas.error).toContain("Christmas");
  });

  it("refuses times outside a future day's hours", async () => {
    const now = pt(10, 14, 15, 0);
    expect((await scheduledAt(pt(10, 15, 10, 45), now)).valid).toBe(false);
    expect((await scheduledAt(pt(10, 15, 19, 45), now)).valid).toBe(false);
    expect((await scheduledAt(pt(10, 16, 13, 45), now)).valid).toBe(false);
  });

  it("keeps ASAP to today", async () => {
    const result = await validatePickupTiming({ type: "ASAP" }, { content, referenceNow: pt(10, 14, 19, 45) });
    expect(result.valid).toBe(false);
  });
});

describe("weekly hours for the contact page", () => {
  it("label the holiday in the current week", () => {
    const week = getWeeklyCustomerHours(makeContent(), pt(12, 23, 12, 0));
    expect(week.map((d) => d.day)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(week[0].hours).toBe("Closed");
    expect(week[4]).toMatchObject({ hours: "Closed", isHoliday: true, holidayName: "Christmas" });
    expect(week[5].hours).toBe("11:00 AM - 8:00 PM");
  });
});

describe("store schedule for a date", () => {
  it("prefers a holiday over the weekly hours", () => {
    const schedule = getStoreScheduleForDate(pt(10, 16, 12, 0), makeContent());
    expect(schedule).toMatchObject({ closed: false, openMinuteOfDay: 660, closeMinuteOfDay: 840 });
  });
});

describe("one-time holidays (YYYY-MM-DD)", () => {
  const content = makeContent({
    holidays: [
      { id: "xmas", name: "Christmas", date: "12-25", closed: true },
      { id: "xmas26", name: "Christmas 2026", date: "2026-12-25", closed: false, start: 11, end: 14 },
      { id: "thanks", name: "Thanksgiving", date: "2026-11-26", closed: true },
    ],
  });

  it("win over a yearly holiday on the same date", async () => {
    expect(getStoreScheduleForDate(pt(12, 25, 12, 0), content)).toMatchObject({
      closed: false,
      closeMinuteOfDay: 840,
      holiday: { name: "Christmas 2026" },
    });
    const asap = await validatePickupTiming({ type: "ASAP" }, { content, referenceNow: pt(12, 25, 12, 0) });
    expect(asap.valid).toBe(true);
  });

  it("apply only in their own year", () => {
    expect(getStoreScheduleForDate(pt(12, 25, 12, 0, 2027), content)).toMatchObject({
      closed: true,
      holiday: { name: "Christmas" },
    });
    expect(getStoreScheduleForDate(pt(11, 26, 12, 0), content)).toMatchObject({ closed: true });
    expect(getStoreScheduleForDate(pt(11, 25, 12, 0, 2027), content).closed).toBe(false);
  });

  it("show on the contact page's week", () => {
    const week = getWeeklyCustomerHours(content, pt(11, 24, 12, 0));
    expect(week[3]).toMatchObject({ day: "Thursday", hours: "Closed", holidayName: "Thanksgiving" });
    const christmasWeek = getWeeklyCustomerHours(content, pt(12, 23, 12, 0));
    expect(christmasWeek[4]).toMatchObject({ hours: "11:00 AM - 2:00 PM", holidayName: "Christmas 2026" });
  });
});
