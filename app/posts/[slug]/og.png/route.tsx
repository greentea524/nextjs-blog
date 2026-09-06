import { notFound } from "next/navigation";
import { renderOgImage } from "@/lib/og";
import { formatDate, getPostBySlug, getPostSlugs } from "@/lib/posts";

// One PNG per post, rendered at build time into out/posts/<slug>/og.png.
// See app/og.png/route.tsx for why this is a route handler.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return renderOgImage({
    title: post.title,
    subtitle: `${formatDate(post.date)} · ${post.readingMinutes} min read`,
  });
}
