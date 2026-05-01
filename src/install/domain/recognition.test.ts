import { describe, expect, it } from "vitest";
import { isRecognizedAiPin } from "./recognition";

describe("isRecognizedAiPin", () => {
  it("requires exact manufacturer and model matches", () => {
    expect(
      isRecognizedAiPin({
        manufacturer: "Humane",
        model: "Ai Pin",
      }),
    ).toBe(true);

    expect(
      isRecognizedAiPin({
        manufacturer: "humane",
        model: "Ai Pin",
      }),
    ).toBe(false);

    expect(
      isRecognizedAiPin({
        manufacturer: "Humane",
        model: "Ai pin",
      }),
    ).toBe(false);

    expect(
      isRecognizedAiPin({
        manufacturer: undefined,
        model: "Ai Pin",
      }),
    ).toBe(false);
  });
});
