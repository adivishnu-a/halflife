"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Decks" },
  { href: "/stats", label: "Stats" },
  { href: "/settings", label: "Settings" },
];

interface HeaderUser {
  username?: string | null;
  isAnonymous?: boolean | null;
}

export function SiteHeader({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const isAnonymous = !user || user.isAnonymous || !user.username;
  return (
    <header className="border-b border-line">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:bg-paper focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-3xl items-center gap-1 px-2 sm:px-4">
        <Link href="/" className="px-2 py-3 text-lg font-semibold tracking-tight">
          Halflife
        </Link>
        <nav aria-label="Main" className="ml-2 flex items-center gap-0.5">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" || pathname.startsWith("/decks") : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-md px-2.5 text-sm ${
                  active ? "font-medium text-ink" : "muted hover:bg-paper-2 hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/account"
          aria-current={pathname.startsWith("/account") ? "page" : undefined}
          className="ml-auto inline-flex min-h-11 items-center rounded-md px-2.5 text-sm muted hover:bg-paper-2 hover:text-ink"
        >
          {isAnonymous ? "Keep my progress" : user.username}
        </Link>
      </div>
    </header>
  );
}
