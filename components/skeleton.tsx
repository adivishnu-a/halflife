/** Route-level loading states: the page's shape in paper-2 blocks, no spinner. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-paper-2 ${className}`} />;
}

export function PageSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    // Tall enough to keep the footer below the fold, so the footer does not
    // jump when the streamed page replaces the skeleton (a 0.1 layout shift).
    <div aria-busy="true" aria-live="polite" className="min-h-dvh space-y-6">
      <p className="sr-only">Loading</p>
      <Skeleton className="h-10 w-48" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-lg" />
      ))}
    </div>
  );
}
