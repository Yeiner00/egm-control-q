import { describe, expect, it } from "vitest";
import { getErrorMessage } from "./errorMessage";

describe("getErrorMessage", () => {
  it("reads messages from Error instances", () => {
    expect(getErrorMessage(new Error("Network failed"))).toBe("Network failed");
  });

  it("reads messages from Supabase-style error objects", () => {
    expect(getErrorMessage({ message: "JWT expired", code: "PGRST301" })).toBe("JWT expired");
  });

  it("uses a fallback when no message is available", () => {
    expect(getErrorMessage({ code: "unknown" }, "No details")).toBe("No details");
  });
});
