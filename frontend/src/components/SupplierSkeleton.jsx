export default function SupplierSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-[4px] border border-border-subtle bg-bg-surface"
        >
          <div className="flex items-center gap-2 p-2.5">
            <div className="h-8 w-8 rounded-full bg-bg-surface-hover" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-2/3 rounded-[4px] bg-bg-surface-hover" />
              <div className="h-2.5 w-1/3 rounded-[4px] bg-bg-surface-hover" />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border-subtle px-2.5 py-1.5">
            <div className="h-3 w-36 rounded-[4px] bg-bg-surface-hover" />
            <div className="h-6 w-6 rounded-[4px] bg-bg-surface-hover" />
          </div>
        </div>
      ))}
    </div>
  );
}
