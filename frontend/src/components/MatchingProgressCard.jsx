import { useNavigate } from 'react-router-dom';

/**
 * Kartu ranking progress matching bulan berjalan (maks 4 user).
 * Visual mengikuti SupplierCard: surface rounded-xl, nested bar, font 11–16.
 *
 * Bucket: Match | Menunggu | No Match (staf tidak cocok) | Ditolak (owner tolak)
 * Tap progress bar → board matching filter Semua + oleh=nick.
 */
export default function MatchingProgressCard({ data }) {
  const navigate = useNavigate();

  if (!data?.users?.length) return null;

  const periodeLabel = data.periode?.label || '';
  const zeroState = Boolean(data.zero_state);

  function openBoardForUser(nick) {
    const name = String(nick || '').trim();
    if (!name) return;
    const qs = new URLSearchParams({ oleh: name });
    try {
      const last = sessionStorage.getItem('heybat_pricelist_pbf_id');
      if (last) qs.set('pbf_id', last);
    } catch {
      /* ignore */
    }
    navigate(`/matching?${qs.toString()}`);
  }

  return (
    <article className="flex flex-col gap-2 rounded-xl bg-bg-surface p-3 shadow-sm shadow-black/30">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold leading-snug text-text-primary">
          Progress Matching
        </h2>
        {periodeLabel ? (
          <span className="shrink-0 rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-semibold text-bg-base">
            {periodeLabel}
          </span>
        ) : null}
      </div>

      {zeroState ? (
        <p className="text-[13px] italic text-text-secondary">
          Belum ada pengajuan bulan ini
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {data.users.map((user) => {
          const match = Number(user.match) || 0;
          const menunggu = Number(user.menunggu) || 0;
          const noMatch = Number(user.no_match) || 0;
          const ditolak = Number(user.ditolak) || 0;
          const diajukan =
            Number(user.diajukan) || match + menunggu + noMatch + ditolak;
          const pct =
            user.pct != null
              ? Number(user.pct)
              : diajukan > 0
                ? Math.round((match / diajukan) * 100)
                : 0;

          return (
            <div key={user.user_id || user.nick} className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[13px] font-semibold text-accent-yellow">
                  {user.nick}
                </p>
                <span className="inline-flex h-[18px] w-12 shrink-0 items-center justify-center rounded-full bg-accent-navy text-[10px] font-semibold tabular-nums text-white">
                  {pct}%
                </span>
              </div>
              <button
                type="button"
                onClick={() => openBoardForUser(user.nick)}
                aria-label={`Buka board matching untuk ${user.nick}`}
                className="mt-1.5 block w-full cursor-pointer rounded-full text-left transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-yellow"
              >
                <div className="h-1.5 overflow-hidden rounded-full bg-border-subtle">
                  <div
                    className="h-full rounded-full bg-accent-yellow transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="min-w-0 shrink-0 text-left text-[11px] text-text-primary">
                  {match} dari {diajukan} diajukan
                </p>
                <div className="inline-flex flex-wrap items-center justify-end gap-1 text-[11px]">
                  <span className="font-medium text-accent-cyan">
                    {match} Match
                  </span>
                  <span className="font-medium text-accent-yellow">
                    {menunggu} Menunggu
                  </span>
                  <span className="font-medium text-state-error">
                    {ditolak} Ditolak
                  </span>
                  <span className="font-medium text-text-muted">
                    {noMatch} No Match
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
