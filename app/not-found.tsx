import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you were looking for does not exist on this site.",
};

export default function NotFound() {
  return (
    <>
      <h1>Page not found</h1>
      <p>That page does not exist — it may have been renamed or removed.</p>
      <p>
        <Link href="/">← Back to home</Link>
      </p>
    </>
  );
}
