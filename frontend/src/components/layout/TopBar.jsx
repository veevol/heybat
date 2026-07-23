export default function TopBar({ title, actions = null }) {
  return (
    <header className="sticky top-0 z-30 bg-gradient-to-b from-bg-surface/80 via-bg-base/70 to-bg-base/0 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-2 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src="/logo_heybat.png"
            alt="Heybat"
            className="h-6 w-6 shrink-0 object-contain"
          />
          <h1 className="truncate text-[15px] font-semibold leading-none text-text-primary">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
    </header>
  );
}
