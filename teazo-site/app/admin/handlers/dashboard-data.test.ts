/**
 * Tests dashboard analytics data selection and fallbacks.
 *
 * Verifies live metrics, empty responses, unavailable
 * analytics services, and legacy dashboard fixtures.
 *
 * All database, storage, and file reads are mocked.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  listActiveEvents: vi.fn(),
  getWebsiteContent: vi.fn(),
  getStorageUsage: vi.fn(),
  listAnalyticsMetrics: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile,
}));

vi.mock("@/app/lib/queries/events", () => ({
  listActiveEvents: mocks.listActiveEvents,
}));

vi.mock(
  "@/app/admin/website-content/handlers/get-website-content",
  () => ({
    getWebsiteContent: mocks.getWebsiteContent,
  }),
);

vi.mock(
  "@/app/admin/handlers/get-storage-usage",
  () => ({
    getStorageUsage: mocks.getStorageUsage,
  }),
);

vi.mock("@/app/lib/queries/analytics", () => ({
  listAnalyticsMetrics: mocks.listAnalyticsMetrics,
}));

import { getDashboardData } from "./dashboard-data";

const periods = [
  "24-hours",
  "7-days",
  "30-days",
] as const;

const fixtureMenuItem = {
  metric_date: "2026-10-30",
  square_item_id: "fixture-item",
  item_name_snapshot: "Fixture Tea",
  event_count: 10,
};

const fixturePage = {
  metric_date: "2026-10-30",
  page_path: "menu",
  page_name_snapshot: "Menu",
  event_count: 20,
};

const liveMenuItem = {
  metric_date: "2026-10-30",
  square_item_id: "live-item",
  item_name_snapshot: "Live Tea",
  event_count: 35,
};

const livePage = {
  metric_date: "2026-10-30",
  page_path: "gallery",
  page_name_snapshot: "Gallery",
  event_count: 45,
};

function makeFixture() {
  return {
    metrics: {
      menuItems: {
        "24-hours": [fixtureMenuItem],
        "7-days": [fixtureMenuItem],
        "30-days": [fixtureMenuItem],
      },
      pages: {
        "24-hours": [fixturePage],
        "7-days": [fixturePage],
        "30-days": [fixturePage],
      },
    },
  };
}

function makeLiveMetrics() {
  return {
    "24-hours": {
      menuItems: [liveMenuItem],
      pages: [livePage],
    },
    "7-days": {
      menuItems: [liveMenuItem],
      pages: [livePage],
    },
    "30-days": {
      menuItems: [liveMenuItem],
      pages: [livePage],
    },
  };
}

describe("Admin dashboard analytics data", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubEnv("D1_PROXY_URL", "");
    vi.stubEnv("PROXY_TOKEN", "");

    mocks.readFile.mockResolvedValue(
      JSON.stringify(makeFixture()),
    );

    mocks.listActiveEvents.mockResolvedValue([]);
    mocks.getWebsiteContent.mockResolvedValue({});
    mocks.getStorageUsage.mockResolvedValue([]);

    mocks.listAnalyticsMetrics.mockResolvedValue(
      makeLiveMetrics(),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses the dashboard fixture when database configuration is missing", async () => {
    const result = await getDashboardData();

    for (const period of periods) {
      expect(result.metrics.menuItems[period]).toEqual(
        [fixtureMenuItem],
      );

      expect(result.metrics.pages[period]).toEqual(
        [fixturePage],
      );
    }

    expect(
      mocks.listAnalyticsMetrics,
    ).not.toHaveBeenCalled();
  });

  it("uses live analytics when database configuration is available", async () => {
    vi.stubEnv(
      "D1_PROXY_URL",
      "https://example.invalid",
    );

    vi.stubEnv("PROXY_TOKEN", "test-token");

    const result = await getDashboardData();

    expect(
      mocks.listAnalyticsMetrics,
    ).toHaveBeenCalledOnce();

    for (const period of periods) {
      expect(result.metrics.menuItems[period]).toEqual(
        [liveMenuItem],
      );

      expect(result.metrics.pages[period]).toEqual(
        [livePage],
      );
    }
  });

  it("preserves genuinely empty live analytics without substituting fixture counts", async () => {
    vi.stubEnv(
      "D1_PROXY_URL",
      "https://example.invalid",
    );

    vi.stubEnv("PROXY_TOKEN", "test-token");

    mocks.listAnalyticsMetrics.mockResolvedValueOnce({
      "24-hours": {
        menuItems: [],
        pages: [],
      },
      "7-days": {
        menuItems: [],
        pages: [],
      },
      "30-days": {
        menuItems: [],
        pages: [],
      },
    });

    const result = await getDashboardData();

    for (const period of periods) {
      expect(result.metrics.menuItems[period]).toEqual([]);
      expect(result.metrics.pages[period]).toEqual([]);
    }
  });

  it("falls back to fixture metrics when live analytics fails", async () => {
    vi.stubEnv(
      "D1_PROXY_URL",
      "https://example.invalid",
    );

    vi.stubEnv("PROXY_TOKEN", "test-token");

    const log = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mocks.listAnalyticsMetrics.mockRejectedValueOnce(
      new Error("D1 unavailable"),
    );

    const result = await getDashboardData();

    expect(
      mocks.listAnalyticsMetrics,
    ).toHaveBeenCalledOnce();

    expect(log).toHaveBeenCalledOnce();

    for (const period of periods) {
      expect(result.metrics.menuItems[period]).toEqual(
        [fixtureMenuItem],
      );

      expect(result.metrics.pages[period]).toEqual(
        [fixturePage],
      );
    }

    expect(result.events).toEqual([]);
    expect(result.storageUsage).toEqual([]);
  });

  it("supports older fixtures containing only menu-item metrics", async () => {
    mocks.readFile.mockResolvedValueOnce(
      JSON.stringify({
        metrics: {
          "24-hours": [fixtureMenuItem],
          "7-days": [fixtureMenuItem],
          "30-days": [fixtureMenuItem],
        },
      }),
    );

    const result = await getDashboardData();

    for (const period of periods) {
      expect(result.metrics.menuItems[period]).toEqual(
        [fixtureMenuItem],
      );

      expect(result.metrics.pages[period]).toEqual([]);
    }
  });

  it("loads dashboard supporting data alongside analytics", async () => {
    const eventData = [
      { id: "test-event" },
    ];

    const websiteData = {
      story: "Test story",
    };

    const storageData = [
      { name: "test-storage" },
    ];

    mocks.listActiveEvents.mockResolvedValueOnce(
      eventData,
    );

    mocks.getWebsiteContent.mockResolvedValueOnce(
      websiteData,
    );

    mocks.getStorageUsage.mockResolvedValueOnce(
      storageData,
    );

    const result = await getDashboardData();

    expect(result.events).toEqual(eventData);
    expect(result.websiteContent).toEqual(websiteData);
    expect(result.storageUsage).toEqual(storageData);

    expect(mocks.readFile).toHaveBeenCalledWith(
      expect.stringContaining("dashboard-sample.txt"),
      "utf8",
    );
  });
});
