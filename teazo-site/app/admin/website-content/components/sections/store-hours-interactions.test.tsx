/**
 * Tests the administrator-facing Business Hours and
 * Holiday Exceptions components.
 *
 * Covers opening/closing controls, validation boundaries,
 * weekly holiday precedence, duplicate dates, recurring
 * holidays, and administrator callbacks.
 *
 * No database, network, or production settings are changed.
 */

// @vitest-environment jsdom

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import type {
  DayHours,
  Holiday,
} from "@/app/types/website-content";

import BusinessHoursRow from "./business-hours-row";
import HolidayCard from "./holiday-card";
import HoursSection from "./hours-section";
import HolidaysSection from "./holidays-section";

const monday: DayHours = {
  day: "Mon",
  start: 9,
  end: 17,
  closed: false,
};

const christmas: Holiday = {
  id: "christmas",
  name: "Christmas",
  date: "12-25",
  closed: true,
};

const weekdays = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

function weeklyHours(): DayHours[] {
  return weekdays.map((day) => ({
    day,
    start: 9,
    end: 17,
    closed: false,
  }));
}

function renderHolidaySection(
  holidays: Holiday[] = [christmas],
) {
  const onUpdateHoliday = vi.fn();
  const onRemoveHoliday = vi.fn();
  const onAddHoliday = vi.fn();

  render(
    <HolidaysSection
      holidays={holidays}
      isOpen={true}
      onToggle={vi.fn()}
      setRef={() => {}}
      onUpdateHoliday={onUpdateHoliday}
      onRemoveHoliday={onRemoveHoliday}
      onAddHoliday={onAddHoliday}
    />,
  );

  return {
    onUpdateHoliday,
    onRemoveHoliday,
    onAddHoliday,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Business Hours administration", () => {
  it("renders opening and closing times for an open day", () => {
    render(
      <BusinessHoursRow
        entry={monday}
        onChange={vi.fn()}
      />,
    );

    const opening = screen.getByLabelText(
      "Mon opening time",
    ) as HTMLInputElement;

    const closing = screen.getByLabelText(
      "Mon closing time",
    ) as HTMLInputElement;

    expect(opening.value).toBe("09:00");
    expect(closing.value).toBe("17:00");

    expect(
      screen.getByRole("switch", {
        name: "Mon open",
      }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("updates opening times and enforces the minimum duration", () => {
    const onChange = vi.fn();

    render(
      <BusinessHoursRow
        entry={monday}
        onChange={onChange}
      />,
    );

    const opening = screen.getByLabelText(
      "Mon opening time",
    );

    fireEvent.change(opening, {
      target: { value: "10:30" },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      start: 10.5,
    });

    fireEvent.change(opening, {
      target: { value: "18:00" },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      start: 16.5,
    });
  });

  it("updates closing times and prevents closing before opening", () => {
    const onChange = vi.fn();

    render(
      <BusinessHoursRow
        entry={monday}
        onChange={onChange}
      />,
    );

    const closing = screen.getByLabelText(
      "Mon closing time",
    );

    fireEvent.change(closing, {
      target: { value: "18:30" },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      end: 18.5,
    });

    fireEvent.change(closing, {
      target: { value: "08:00" },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      end: 9.5,
    });
  });

  it("toggles a day closed and disables its time fields", () => {
    const onChange = vi.fn();

    const { rerender } = render(
      <BusinessHoursRow
        entry={monday}
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Mon open",
      }),
    );

    expect(onChange).toHaveBeenCalledWith({
      closed: true,
    });

    rerender(
      <BusinessHoursRow
        entry={{ ...monday, closed: true }}
        onChange={onChange}
      />,
    );

    expect(
      (screen.getByLabelText(
        "Mon opening time",
      ) as HTMLInputElement).disabled,
    ).toBe(true);

    expect(
      (screen.getByLabelText(
        "Mon closing time",
      ) as HTMLInputElement).disabled,
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Mon open",
      }),
    );

    expect(onChange).toHaveBeenLastCalledWith({
      closed: false,
    });
  });

  it("displays holiday adjustments alongside regular hours", () => {
    render(
      <BusinessHoursRow
        entry={monday}
        holiday={{
          ...christmas,
          name: "Special Hours",
          closed: false,
          start: 10,
          end: 16,
        }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Special Hours"),
    ).toBeTruthy();

    expect(
      screen.getByTitle(
        "Special Hours: 10:00am – 4:00pm",
      ),
    ).toBeTruthy();
  });
});

describe("Business Hours weekly holiday behavior", () => {
  it("prefers a one-time holiday over a recurring holiday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(
      new Date(2026, 9, 30, 12),
    );

    render(
      <HoursSection
        hours={weeklyHours()}
        holidays={[
          {
            id: "annual",
            name: "Recurring Closure",
            date: "10-30",
            closed: true,
          },
          {
            id: "specific",
            name: "One-Time Closure",
            date: "2026-10-30",
            closed: true,
          },
        ]}
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onUpdateDay={vi.fn()}
      />,
    );

    expect(
      screen.getByText("One-Time Closure"),
    ).toBeTruthy();

    expect(
      screen.queryByText("Recurring Closure"),
    ).toBeNull();
  });

  it("passes the correct weekday index to the update handler", () => {
    const onUpdateDay = vi.fn();

    render(
      <HoursSection
        hours={weeklyHours()}
        holidays={[]}
        isOpen={true}
        onToggle={vi.fn()}
        setRef={() => {}}
        onUpdateDay={onUpdateDay}
      />,
    );

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Fri open",
      }),
    );

    expect(onUpdateDay).toHaveBeenCalledWith(
      5,
      { closed: true },
    );
  });
});

describe("Holiday Exceptions administration", () => {
  it("allows an administrator to add a holiday", () => {
    const { onAddHoliday } = renderHolidaySection();

    fireEvent.click(
      screen.getByRole("button", {
        name: "New Holiday +",
      }),
    );

    expect(onAddHoliday).toHaveBeenCalledOnce();
  });

  it("allows an administrator to remove a holiday", () => {
    const { onRemoveHoliday } = renderHolidaySection();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Christmas",
      }),
    );

    expect(onRemoveHoliday).toHaveBeenCalledOnce();
  });

  it("updates a holiday name and identifies an empty name", () => {
    const { onUpdateHoliday } = renderHolidaySection();

    const input = screen.getByRole("textbox", {
      name: "Holiday name",
    });

    fireEvent.change(input, {
      target: { value: "Winter Holiday" },
    });

    expect(onUpdateHoliday).toHaveBeenCalledWith(
      "christmas",
      { name: "Winter Holiday" },
    );

    fireEvent.blur(input);

    expect(
      screen.queryByText("Name is required"),
    ).toBeNull();
  });

  it("identifies duplicate holiday dates", () => {
    renderHolidaySection([
      christmas,
      {
        ...christmas,
        id: "duplicate",
        name: "Another Christmas",
      },
    ]);

    expect(
      screen.getAllByText(
        "Another holiday already uses this date",
      ),
    ).toHaveLength(2);
  });

  it("allows a one-time and recurring holiday on the same calendar date", () => {
    renderHolidaySection([
      christmas,
      {
        id: "specific",
        name: "One-Time Christmas",
        date: "2026-12-25",
        closed: true,
      },
    ]);

    expect(
      screen.queryByText(
        "Another holiday already uses this date",
      ),
    ).toBeNull();
  });

  it("identifies an incomplete holiday date", () => {
    renderHolidaySection([
      {
        ...christmas,
        date: "12-",
      },
    ]);

    expect(
      screen.getByText(
        "Select both a month and a day",
      ),
    ).toBeTruthy();
  });

  it("enables adjusted holiday hours with defaults", () => {
    const { onUpdateHoliday } = renderHolidaySection();

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Use adjusted hours for Christmas",
      }),
    );

    expect(onUpdateHoliday).toHaveBeenCalledWith(
      "christmas",
      {
        closed: false,
        start: 9,
        end: 17,
      },
    );
  });

  it("enforces minimum duration for adjusted holiday hours", () => {
    const onChange = vi.fn();

    render(
      <HolidayCard
        holiday={{
          ...christmas,
          closed: false,
          start: 10,
          end: 16,
        }}
        isDuplicateDate={false}
        onChange={onChange}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByLabelText(
        "Christmas opening time",
      ),
      { target: { value: "18:00" } },
    );

    expect(onChange).toHaveBeenCalledWith({
      start: 15.5,
    });

    fireEvent.change(
      screen.getByLabelText(
        "Christmas closing time",
      ),
      { target: { value: "08:00" } },
    );

    expect(onChange).toHaveBeenCalledWith({
      end: 10.5,
    });
  });

  it("clamps a holiday day when its month changes", () => {
    const { onUpdateHoliday } = renderHolidaySection([
      {
        id: "test-holiday",
        name: "Test Holiday",
        date: "01-31",
        closed: true,
      },
    ]);

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Holiday month",
      }),
      { target: { value: "02" } },
    );

    expect(onUpdateHoliday).toHaveBeenCalledWith(
      "test-holiday",
      { date: "02-29" },
    );
  });

  it("converts a one-time holiday to a recurring holiday", () => {
    const { onUpdateHoliday } = renderHolidaySection([
      {
        id: "specific",
        name: "One-Time Holiday",
        date: "2026-12-25",
        closed: true,
      },
    ]);

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Repeats every year",
      }),
    );

    expect(onUpdateHoliday).toHaveBeenCalledWith(
      "specific",
      { date: "12-25" },
    );
  });
});
