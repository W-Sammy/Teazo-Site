// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import StorageUsage from "@/app/admin/components/dashboard/storage-usage";

afterEach(cleanup);

const GB = 1024 ** 3;

describe("storage usage card", () => {
  it("shows small amounts of stored images instead of rounding them to zero", () => {
    render(
      <StorageUsage
        usage={[{ service: "R2", currentBytes: 413_620, maxBytes: 8.8 * GB, fileCount: 4 }]}
      />,
    );

    expect(screen.getByText("403.9 KB")).toBeTruthy();
    expect(screen.getByText(/4 files/)).toBeTruthy();
    expect(screen.getByText("<1%")).toBeTruthy();
    expect(screen.getByText("of 8.8 GB")).toBeTruthy();
  });

  it("keeps showing 0% and an empty bar when nothing is stored", () => {
    const { container } = render(
      <StorageUsage usage={[{ service: "R2", currentBytes: 0, maxBytes: 8.8 * GB, fileCount: 0 }]} />,
    );

    expect(screen.getByText("0 B")).toBeTruthy();
    expect(screen.getByText(/0 files/)).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
    const bar = container.querySelector('[style*="width"]') as HTMLElement;
    expect(bar.style.width).toBe("0%");
  });

  it("formats general data in MB and leaves out the file count", () => {
    render(<StorageUsage usage={[{ service: "D1", currentBytes: 487_424, maxBytes: 500_000_000 }]} />);

    expect(screen.getByText("476.0 KB")).toBeTruthy();
    expect(screen.getByText("of 476.8 MB")).toBeTruthy();
    expect(screen.queryByText(/files?$/)).toBeNull();
  });
});
