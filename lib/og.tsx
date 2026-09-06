import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";

/** Standard Open Graph card dimensions. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

type OgImageProps = {
  title: string;
  subtitle: string;
};

/**
 * Renders a social preview card to PNG.
 *
 * Satori (behind ImageResponse) supports a subset of CSS and requires an
 * explicit `display` on any element with children, so the styles here stay
 * deliberately flat.
 */
export function renderOgImage({ title, subtitle }: OgImageProps): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#09090b",
          color: "#f4f4f5",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#38bdf8" }}>
          {siteConfig.name}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: title.length > 60 ? 56 : 68,
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "#a1a1aa" }}>
          {subtitle}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
