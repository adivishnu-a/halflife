/** The Halflife mark: a memory at its half-life, half kept, half gone. */
export function Mark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path d="M16 4a12 12 0 0 0 0 24z" fill="currentColor" />
      <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}
