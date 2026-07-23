export default function Toast({ message, onClose }) {
  if (!message) return null;

  return (
    <div
      className="fixed bottom-24 left-3 right-3 z-50 mx-auto max-w-sm rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2 text-[13px] leading-snug text-text-primary shadow-sm shadow-black/20 sm:bottom-6 sm:left-auto sm:right-6"
      role="status"
    >
      <div className="flex items-start gap-2">
        <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-[4px] bg-state-success" />
        <p className="flex-1">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="text-text-muted transition hover:text-text-primary"
          aria-label="Tutup notifikasi"
        >
          ×
        </button>
      </div>
    </div>
  );
}
