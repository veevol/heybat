export default function PricelistSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-[4px] border border-border-subtle bg-bg-surface p-2.5"
        >
          <div className="h-3.5 w-2/3 rounded-[4px] bg-bg-surface-hover" />
          <div className="mt-2 h-3 w-1/2 rounded-[4px] bg-bg-surface-hover" />
        </div>
      ))}
    </div>
  );
}
