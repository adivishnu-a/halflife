import Link from "next/link";

export default function NotFound() {
  return (
    <div className="sheet p-6 sm:p-8">
      <h1 className="text-2xl font-bold">There is nothing at this address</h1>
      <p className="mt-2 max-w-prose muted">
        The page may have moved, or the deck it pointed at was deleted. Your decks are still where you left them.
      </p>
      <Link href="/" className="btn btn-primary mt-5">
        Go to my decks
      </Link>
    </div>
  );
}
