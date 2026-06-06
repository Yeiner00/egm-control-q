import { describe, expect, it } from "vitest";
import { assertAllowedFetchUrl } from "./fetch-guard";

describe("assertAllowedFetchUrl", () => {
  const supabaseOrigin = "https://vsiyibdyuwgsejcwjeht.supabase.co";

  it("permite fetch al mismo host configurado en SUPABASE_URL", () => {
    expect(() =>
      assertAllowedFetchUrl(`${supabaseOrigin}/rest/v1/rpc/keepalive`, supabaseOrigin),
    ).not.toThrow();
  });

  it("permite fetch a un subpath distinto del mismo host", () => {
    expect(() =>
      assertAllowedFetchUrl(`${supabaseOrigin}/storage/v1/object/bucket/file.png`, supabaseOrigin),
    ).not.toThrow();
  });

  it("rechaza fetch a un host externo aunque comparta prefijo", () => {
    expect(() =>
      assertAllowedFetchUrl("https://vsiyibdyuwgsejcwjeht.supabase.co.attacker.io/foo", supabaseOrigin),
    ).toThrowError(/origen/);
  });

  it("rechaza fetch a un host completamente diferente", () => {
    expect(() =>
      assertAllowedFetchUrl("https://example.com/api", supabaseOrigin),
    ).toThrowError(/origen/);
  });

  it("rechaza fetch a una IP literal aunque el path parezca interno", () => {
    expect(() =>
      assertAllowedFetchUrl("https://169.254.169.254/latest/meta-data/", supabaseOrigin),
    ).toThrowError(/origen/);
  });

  it("rechaza URL malformada", () => {
    expect(() => assertAllowedFetchUrl("not-a-url", supabaseOrigin)).toThrowError(/URL/);
  });
});
