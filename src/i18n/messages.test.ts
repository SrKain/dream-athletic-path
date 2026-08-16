import { describe, expect, it } from "vitest";

import { messages } from "./messages";

describe("message catalog", () => {
  it("ships a single US English catalog", () => {
    expect(Object.keys(messages)).toEqual(["en"]);
    expect(messages.en["nav.login"]).toBe("Sign in");
  });
});
