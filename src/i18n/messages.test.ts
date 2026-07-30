import { describe, expect, it } from "vitest";

import { messages } from "./messages";

describe("message catalog", () => {
  it("keeps Portuguese and English keys aligned", () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.pt).sort());
  });
});
