import { describe, expect, it } from "vitest";
import { renderLicenseIssuedEmail, safeDisplayName } from "../src/services/email-service";

const base = {
  product: "PoliteDB",
  planName: "Ultimate",
  licenseKey: "POLAR-KEY-1",
  seatsAllowed: 2,
  expiresAt: null,
};

describe("license email", () => {
  it("greets a normal name", () => {
    const { text, html } = renderLicenseIssuedEmail({ ...base, customerName: "Nguyễn Văn A" });
    expect(text).toContain("Hi Nguyễn Văn A,");
    expect(html).toContain("<p>Hi Nguyễn Văn A,</p>");
  });

  it.each([
    '<a href="https://evil.example">Verify your account</a>',
    "Please log in at https://evil.example",
    "visit www.evil.example now",
    "contact support@evil.example",
    "Reset at evil.com",
    "x".repeat(61),
  ])("does not put a buyer-supplied lure into the email: %s", (customerName) => {
    const { text, html } = renderLicenseIssuedEmail({ ...base, customerName });
    expect(text).toContain("Hi there,");
    expect(html).toContain("<p>Hi there,</p>");
    expect(html).not.toContain("evil");
  });

  it("escapes every interpolated value in the HTML", () => {
    const { html } = renderLicenseIssuedEmail({
      ...base,
      customerName: "Tom & Jerry",
      planName: '<img src=x onerror="alert(1)">',
      licenseKey: "<b>KEY</b>",
    });
    expect(html).toContain("Hi Tom &amp; Jerry,");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("<code>&lt;b&gt;KEY&lt;/b&gt;</code>");
    expect(html).not.toContain("<img");
  });

  it("strips control characters from names", () => {
    expect(safeDisplayName("Ann\r\nBcc: x")).toBe("Ann Bcc: x");
    expect(safeDisplayName("   ")).toBeNull();
  });
});
