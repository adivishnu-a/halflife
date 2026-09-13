"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Mark } from "@/components/mark";
import { ThemeToggle } from "@/components/theme-toggle";

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
  const linkClass = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium sm:px-2.5 ${
      active ? "bg-paper-2 text-ink" : "muted hover:bg-paper-2 hover:text-ink"
    }`;
  return (
    <header>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:bg-paper focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-3xl items-center gap-0.5 px-1 pt-2 sm:gap-1 sm:px-4">
        <Link
          href="/"
          aria-label="Halflife, decks"
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-lg font-bold tracking-tight sm:mr-2"
          style={{ fontVariationSettings: '"wdth" 112' }}
        >
          <Mark size={22} />
          <span className="hidden sm:inline">Halflife</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-0.5">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" || pathname.startsWith("/decks") : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-0.5">
          <Link
            href="/account"
            aria-label={isAnonymous ? "Keep my progress" : undefined}
            aria-current={pathname.startsWith("/account") ? "page" : undefined}
            className={linkClass(pathname.startsWith("/account"))}
          >
            {isAnonymous ? (
              <>
                <span className="sm:hidden">Keep progress</span>
                <span className="hidden sm:inline">Keep my progress</span>
              </>
            ) : (
              user.username
            )}
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
