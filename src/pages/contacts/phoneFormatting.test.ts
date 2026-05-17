import { describe, expect, it } from "vitest";
import {
  formatPhoneForDisplay,
  hasDialablePhoneDigits,
  normalizePhoneInput,
  sanitizePhoneInput,
} from "./phoneFormatting";

describe("phoneFormatting", () => {
  it("formats common NANP numbers", () => {
    expect(formatPhoneForDisplay("1231231234")).toBe("(123) 123-1234");
    expect(formatPhoneForDisplay("(123) 123-1234")).toBe("(123) 123-1234");
    expect(formatPhoneForDisplay("123-123-1234")).toBe("(123) 123-1234");
    expect(formatPhoneForDisplay("1 123 123 1234")).toBe("+1 (123) 123-1234");
    expect(formatPhoneForDisplay("+11231231234")).toBe("+1 (123) 123-1234");
  });

  it("preserves unknown international formats", () => {
    expect(formatPhoneForDisplay("+44 20 7946 0958")).toBe("+44 20 7946 0958");
  });

  it("normalizes input whitespace", () => {
    expect(normalizePhoneInput("  123   456  ")).toBe("123 456");
  });

  it("detects dialable digits", () => {
    expect(hasDialablePhoneDigits("abc")).toBe(false);
    expect(hasDialablePhoneDigits("   ")).toBe(false);
    expect(hasDialablePhoneDigits("ext. 99")).toBe(true);
    expect(hasDialablePhoneDigits("+1 (123) 123-1234")).toBe(true);
  });

  it("sanitizes phone input while typing", () => {
    expect(sanitizePhoneInput("abc555")).toBe("555");
    expect(sanitizePhoneInput("+1 (555) abc")).toBe("+1555");
    expect(sanitizePhoneInput("++1---555")).toBe("+1555");
    expect(sanitizePhoneInput("hello")).toBe("");
    expect(sanitizePhoneInput("  +44 20 7946 0958")).toBe("+442079460958");
    expect(sanitizePhoneInput("12345678901234567890")).toBe("123456789012345");
  });
});
