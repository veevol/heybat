export default function ObatYeloSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-[4px] border border-border-subtle bg-bg-surface p-2.5"
        >
          <div className="h-3.5 w-3/4 rounded-[4px] bg-bg-surface-hover" />
          <div className="mt-1.5 flex gap-1">
            <div className="h-3 w-20 rounded-[4px] bg-bg-surface-hover" />
            <div className="h-3 w-14 rounded-[4px] bg-bg-surface-hover" />
          </div>
        </div>
      ))}
    </div>
  );
}
