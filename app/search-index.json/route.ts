import { getSearchIndex } from "@/lib/posts";

// Rendered once at build time into out/search-index.json. A GET handler in
// export mode has to opt into static rendering, the same as the feed does.
export const dynamic = "force-static";

export function GET(): Response {
  return Response.json(getSearchIndex());
}
