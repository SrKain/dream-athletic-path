import { describe, it, expect } from "vitest";
import {
  isWithinSendingWindow,
  getNextSendingWindowStart,
  getNextWindowDescription,
} from "./sending-window";

describe("isWithinSendingWindow", () => {
  describe("Weekday mornings (Monday-Friday 08:00-12:00)", () => {
    it("should allow Monday 10:00am", () => {
      const monday = new Date("2026-08-03T10:00:00"); // Monday
      expect(isWithinSendingWindow(monday)).toBe(true);
    });

    it("should allow Friday 08:00am (exact start)", () => {
      const friday = new Date("2026-08-07T08:00:00"); // Friday
      expect(isWithinSendingWindow(friday)).toBe(true);
    });

    it("should NOT allow Friday 12:00pm (exact end)", () => {
      const friday = new Date("2026-08-07T12:00:00"); // Friday noon
      expect(isWithinSendingWindow(friday)).toBe(false);
    });

    it("should NOT allow Tuesday 07:59am (before window)", () => {
      const tuesday = new Date("2026-08-04T07:59:00"); // Tuesday
      expect(isWithinSendingWindow(tuesday)).toBe(false);
    });
  });

  describe("Weekday afternoons (Monday-Friday 13:00-19:00)", () => {
    it("should allow Wednesday 15:30pm", () => {
      const wednesday = new Date("2026-08-05T15:30:00"); // Wednesday (today)
      expect(isWithinSendingWindow(wednesday)).toBe(true);
    });

    it("should allow Thursday 13:00pm (exact start)", () => {
      const thursday = new Date("2026-08-06T13:00:00"); // Thursday
      expect(isWithinSendingWindow(thursday)).toBe(true);
    });

    it("should NOT allow Thursday 19:00pm (exact end)", () => {
      const thursday = new Date("2026-08-06T19:00:00"); // Thursday
      expect(isWithinSendingWindow(thursday)).toBe(false);
    });

    it("should NOT allow Monday 18:59pm then 19:01pm", () => {
      const before = new Date("2026-08-03T18:59:00"); // Monday
      const after = new Date("2026-08-03T19:01:00"); // Monday
      expect(isWithinSendingWindow(before)).toBe(true);
      expect(isWithinSendingWindow(after)).toBe(false);
    });
  });

  describe("Weekday lunch break (12:00-13:00)", () => {
    it("should NOT allow Tuesday 12:15pm", () => {
      const tuesday = new Date("2026-08-04T12:15:00"); // Tuesday
      expect(isWithinSendingWindow(tuesday)).toBe(false);
    });

    it("should NOT allow Wednesday 12:45pm", () => {
      const wednesday = new Date("2026-08-05T12:45:00"); // Wednesday
      expect(isWithinSendingWindow(wednesday)).toBe(false);
    });
  });

  describe("Saturday windows (09:00-12:00 and 13:00-18:00)", () => {
    it("should allow Saturday 10:00am", () => {
      const saturday = new Date("2026-08-08T10:00:00"); // Saturday
      expect(isWithinSendingWindow(saturday)).toBe(true);
    });

    it("should allow Saturday 09:00am (exact start)", () => {
      const saturday = new Date("2026-08-08T09:00:00"); // Saturday
      expect(isWithinSendingWindow(saturday)).toBe(true);
    });

    it("should NOT allow Saturday 08:30am (before window)", () => {
      const saturday = new Date("2026-08-08T08:30:00"); // Saturday
      expect(isWithinSendingWindow(saturday)).toBe(false);
    });

    it("should allow Saturday 14:00pm", () => {
      const saturday = new Date("2026-08-08T14:00:00"); // Saturday
      expect(isWithinSendingWindow(saturday)).toBe(true);
    });

    it("should NOT allow Saturday 18:00pm (exact end)", () => {
      const saturday = new Date("2026-08-08T18:00:00"); // Saturday
      expect(isWithinSendingWindow(saturday)).toBe(false);
    });

    it("should NOT allow Saturday 18:30pm", () => {
      const saturday = new Date("2026-08-08T18:30:00"); // Saturday
      expect(isWithinSendingWindow(saturday)).toBe(false);
    });
  });

  describe("Sunday (no windows - rest day)", () => {
    it("should NOT allow Sunday 10:00am", () => {
      const sunday = new Date("2026-08-09T10:00:00"); // Sunday
      expect(isWithinSendingWindow(sunday)).toBe(false);
    });

    it("should NOT allow Sunday 14:00pm", () => {
      const sunday = new Date("2026-08-09T14:00:00"); // Sunday
      expect(isWithinSendingWindow(sunday)).toBe(false);
    });

    it("should NOT allow Sunday 20:00pm", () => {
      const sunday = new Date("2026-08-09T20:00:00"); // Sunday
      expect(isWithinSendingWindow(sunday)).toBe(false);
    });
  });

  describe("Weekday nights", () => {
    it("should NOT allow Monday 20:00pm", () => {
      const monday = new Date("2026-08-03T20:00:00"); // Monday
      expect(isWithinSendingWindow(monday)).toBe(false);
    });

    it("should NOT allow Wednesday 23:30pm", () => {
      const wednesday = new Date("2026-08-05T23:30:00"); // Wednesday
      expect(isWithinSendingWindow(wednesday)).toBe(false);
    });

    it("should NOT allow Friday 02:00am", () => {
      const friday = new Date("2026-08-07T02:00:00"); // Friday
      expect(isWithinSendingWindow(friday)).toBe(false);
    });
  });
});

describe("getNextSendingWindowStart", () => {
  describe("Same day next window", () => {
    it("should return afternoon window when during lunch break", () => {
      const tuesday = new Date("2026-08-04T12:15:00"); // Tuesday 12:15pm
      const next = getNextSendingWindowStart(tuesday);

      expect(next.getDay()).toBe(2); // Still Tuesday
      expect(next.getHours()).toBe(13);
      expect(next.getMinutes()).toBe(0);
    });

    it("should return afternoon window when in morning window", () => {
      const monday = new Date("2026-08-03T09:00:00"); // Monday 9am
      const next = getNextSendingWindowStart(monday);

      // Should still find afternoon window same day
      expect(next.getDay()).toBe(1); // Still Monday
      expect(next.getHours()).toBe(13);
    });
  });

  describe("Next day window", () => {
    it("should return Monday 08:00 when Sunday evening", () => {
      const sunday = new Date("2026-08-09T20:00:00"); // Sunday 8pm
      const next = getNextSendingWindowStart(sunday);

      expect(next.getDay()).toBe(1); // Monday
      expect(next.getHours()).toBe(8);
      expect(next.getMinutes()).toBe(0);
    });

    it("should return Monday 08:00 when Saturday night", () => {
      const saturday = new Date("2026-08-08T20:00:00"); // Saturday 8pm
      const next = getNextSendingWindowStart(saturday);

      expect(next.getDay()).toBe(1); // Monday
      expect(next.getHours()).toBe(8);
      expect(next.getMinutes()).toBe(0);
    });

    it("should return Tuesday 08:00 when Monday night", () => {
      const monday = new Date("2026-08-03T22:00:00"); // Monday 10pm
      const next = getNextSendingWindowStart(monday);

      expect(next.getDay()).toBe(2); // Tuesday
      expect(next.getHours()).toBe(8);
      expect(next.getMinutes()).toBe(0);
    });
  });

  describe("Saturday special timing", () => {
    it("should return Saturday 09:00 when Friday night", () => {
      const friday = new Date("2026-08-07T21:00:00"); // Friday 9pm
      const next = getNextSendingWindowStart(friday);

      expect(next.getDay()).toBe(6); // Saturday
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(0);
    });

    it("should return Saturday 13:00 when Saturday 12:30pm", () => {
      const saturday = new Date("2026-08-08T12:30:00"); // Saturday 12:30pm
      const next = getNextSendingWindowStart(saturday);

      expect(next.getDay()).toBe(6); // Still Saturday
      expect(next.getHours()).toBe(13);
      expect(next.getMinutes()).toBe(0);
    });
  });

  describe("Edge cases", () => {
    it("should handle exact window start time", () => {
      const monday = new Date("2026-08-03T08:00:00"); // Monday 8am exact
      const next = getNextSendingWindowStart(monday);

      // Should find the afternoon window since we're at the start of morning
      expect(next.getDay()).toBe(1); // Monday
      expect(next.getHours()).toBe(13);
    });

    it("should handle midnight", () => {
      const wednesday = new Date("2026-08-05T00:00:00"); // Wednesday midnight (Aug 5, 2026)
      const next = getNextSendingWindowStart(wednesday);

      expect(next.getDay()).toBe(3); // Wednesday
      expect(next.getHours()).toBe(8);
      expect(next.getMinutes()).toBe(0);
    });
  });
});

describe("getNextWindowDescription", () => {
  it("should return 'Today at HH:MM' for same day", () => {
    const tuesday = new Date("2026-08-04T12:00:00"); // Tuesday noon
    const description = getNextWindowDescription(tuesday);

    expect(description).toBe("Today at 13:00");
  });

  it("should return 'Tomorrow (DayName) at HH:MM' for next day", () => {
    const sunday = new Date("2026-08-09T20:00:00"); // Sunday evening
    const description = getNextWindowDescription(sunday);

    expect(description).toBe("Tomorrow (Monday) at 08:00");
  });

  it("should return 'DayName at HH:MM' for future days", () => {
    const thursday = new Date("2026-08-06T20:00:00"); // Thursday evening -> Saturday
    // But Friday is a weekday, so next is Friday 08:00 (Tomorrow).
    // Let's test from Friday night to Monday (skip Sunday rest day):
    const saturday = new Date("2026-08-08T20:00:00"); // Saturday evening -> Monday 08:00 (skips Sunday)
    const description = getNextWindowDescription(saturday);

    expect(description).toBe("Monday at 08:00");
  });
});
