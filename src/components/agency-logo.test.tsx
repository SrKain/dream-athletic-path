import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgencyLogo } from "./agency-logo";

describe("AgencyLogo component", () => {
  const supabaseLogoUrl =
    "https://ugxoweynkdzzfdbbppnv.supabase.co/storage/v1/object/public/athlete-media/agency/branding/logo-1788972833803.png";

  it("renders optimized transformed image for valid Supabase logo URL", () => {
    const html = renderToString(<AgencyLogo logoUrl={supabaseLogoUrl} variant="header" />);
    expect(html).toContain("<img");
    expect(html).toContain(
      "render/image/public/athlete-media/agency/branding/logo-1788972833803.png",
    );
    expect(html).toContain("width=400");
    expect(html).toContain("resize=contain");
    expect(html).toContain('alt="Go Team Go Agency"');
    expect(html).toContain('decoding="async"');
  });

  it("renders typography text fallback when logoUrl is null", () => {
    const html = renderToString(<AgencyLogo logoUrl={null} variant="header" />);
    expect(html).not.toContain("<img");
    expect(html).toContain("Go Team Go");
  });

  it("renders typography text fallback when logoUrl is empty or whitespace", () => {
    const html = renderToString(<AgencyLogo logoUrl="   " variant="footer" />);
    expect(html).not.toContain("<img");
    expect(html).toContain("Go Team Go");
  });

  it("applies footer-specific classes when variant is footer", () => {
    const html = renderToString(<AgencyLogo logoUrl={supabaseLogoUrl} variant="footer" />);
    expect(html).toContain("h-7");
    expect(html).toContain("max-w-[180px]");
  });

  it("preserves SVG format for SVG logo URLs", () => {
    const svgUrl =
      "https://ugxoweynkdzzfdbbppnv.supabase.co/storage/v1/object/public/athlete-media/agency/branding/logo.svg";
    const html = renderToString(<AgencyLogo logoUrl={svgUrl} variant="header" />);
    expect(html).toContain("<img");
    expect(html).toContain(svgUrl);
    expect(html).not.toContain("render/image");
  });
});
