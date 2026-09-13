"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Mark } from "@/components/mark";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "Decks" },
  { href: "/stats", label: "Stats" },
  { href: "/settings", label: "Settings" },
  { href: "/about", label: "About" },
];

interface HeaderUser {
  username?: string | null;
  isAnonymous?: boolean | null;
}

/** One row on wide screens. On a phone the wordmark and account sit on top and the nav gets its own row. */
export function SiteHeader({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const isAnonymous = !user || user.isAnonymous || !user.username;
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/decks") : pathname.startsWith(href);
  const linkClass = (active: boolean) =>
    `inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2.5 text-sm font-medium ${
      active ? "bg-paper-2 text-ink" : "muted hover:bg-paper-2 hover:text-ink"
    }`;
  const nav = (
    <nav aria-label="Main" className="flex items-center gap-0.5">
      {NAV.map((item) => (
        <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined} className={linkClass(isActive(item.href))}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
  const account = (
    <Link
      href="/account"
      aria-current={pathname.startsWith("/account") ? "page" : undefined}
      className={`${linkClass(pathname.startsWith("/account"))} ${isAnonymous ? "text-accent" : ""}`}
    >
      {isAnonymous ? "Keep my progress" : user.username}
    </Link>
  );

  return (
    <header>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:bg-paper focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="mx-auto max-w-3xl px-2 pt-2 sm:px-4">
        <div className="flex items-center gap-1">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-lg font-bold tracking-tight sm:mr-2"
            style={{ fontVariationSettings: '"wdth" 112' }}
          >
            <Mark size={22} />
            Halflife
          </Link>
          <div className="hidden sm:block">{nav}</div>
          <div className="ml-auto flex items-center gap-0.5">
            {account}
            <ThemeToggle />
          </div>
        </div>
        <div className="-mx-2 overflow-x-auto px-2 pb-1 sm:hidden">{nav}</div>
      </div>
    </header>
  );
}
