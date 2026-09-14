import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <p className="mx-auto max-w-3xl px-4 py-5 text-xs leading-relaxed muted sm:px-6">
        Built by Adi Vishnu Avula.{" "}
        <a className="underline" href="https://github.com/adivishnu-a/halflife">
          Source
        </a>
        .{" "}
        <Link className="underline" href="/about#credits">
          Credits and licences
        </Link>
        . Non-commercial.
      </p>
    </footer>
  );
}
