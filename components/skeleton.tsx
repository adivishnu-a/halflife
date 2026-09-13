/** Route-level loading states: the page's shape in paper-2 blocks, no spinner. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-paper-2 ${className}`} />;
}

export function PageSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <p className="sr-only">Loading</p>
      <Skeleton className="h-10 w-48" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-lg" />
      ))}
    </div>
  );
}
