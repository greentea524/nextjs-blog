/**
 * Emits a structured-data block.
 *
 * The JSON is escaped before it goes into the script tag: a literal `<` in any
 * string value could otherwise close the element early and break the page.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
