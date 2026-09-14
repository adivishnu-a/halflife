import { Skeleton } from "@/components/skeleton";

/** The mat with an empty stack, so the review page lands in place before its cards arrive. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="mat px-4 py-5 sm:px-8 sm:py-7">
      <p className="sr-only">Loading your cards</p>
      <div className="h-5 w-32 rounded bg-mat-line" />
      <div className="segments mt-3">
        {Array.from({ length: 8 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="stack mt-9 mb-9">
        <div className="stack-ghost two" />
        <div className="stack-ghost one" />
        <div className="stock relative min-h-[44vh]" />
      </div>
      <Skeleton className="min-h-14 rounded-lg bg-mat-line" />
    </div>
  );
}
