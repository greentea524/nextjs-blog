import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site";
import styles from "./layout.module.css";
import "./globals.css";

export const metadata: Metadata = {
  // Absolute base for the Open Graph and canonical URLs resolved below.
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.title,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.description,
  authors: [{ name: siteConfig.name }],
  openGraph: {
    type: "website",
    siteName: siteConfig.title,
    title: siteConfig.title,
    description: siteConfig.description,
    url: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className={styles.shell}>
          <header className={styles.header}>
            <div className={`${styles.container} ${styles.headerInner}`}>
              <p className={styles.brand}>
                <Link href="/" className={styles.brandLink}>
                  {siteConfig.name}
                </Link>
              </p>
              <p className={styles.tagline}>Notes on building for the web</p>
            </div>
          </header>

          <main className={styles.main}>
            <div className={styles.container}>{children}</div>
          </main>

          <footer className={styles.footer}>
            <div className={styles.container}>
              <p className={styles.footerInner}>
                © {new Date().getFullYear()} {siteConfig.name}. Built with
                Next.js, published to GitHub Pages.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
