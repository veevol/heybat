import { useEffect, useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Settings, UserRound } from 'lucide-react';
import SheetModal from '../SheetModal';
import NavCircleLoader from './NavCircleLoader';
import {
  NAV_PILL_VISIBLE_SLOTS,
  PRIMARY_NAV_ITEMS,
  resolvePageAction,
} from './navConfig';

/** Collapsed control */
const CIRCLE = 'h-14 w-14';
/**
 * Fixed outer width for expanded pill (~5 nav slots + optional action).
 * Inner nav track scrolls if PRIMARY_NAV_ITEMS grows past NAV_PILL_VISIBLE_SLOTS.
 */
const PILL = 'h-14 w-[min(calc(100vw-2rem),20.5rem)]';

export default function BottomNav({ pageAction = null, navLoading = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [akunOpen, setAkunOpen] = useState(false);
  const [circleBusy, setCircleBusy] = useState(false);
  const labelId = useId();

  const action = resolvePageAction(location.pathname, pageAction);

  useEffect(() => {
    if (!expanded) return undefined;

    function onKey(e) {
      if (e.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  // Collapse when the route changes via any means
  useEffect(() => {
    setExpanded(false);
  }, [location.pathname]);

  function collapse() {
    setExpanded(false);
  }

  function goTo(path) {
    setAkunOpen(false);
    collapse();
    navigate(path);
  }

  function handleNavItem(item) {
    if (item.type === 'link' && item.to) {
      collapse();
      navigate(item.to);
      return;
    }
    if (item.type === 'akun-sheet') {
      collapse();
      setAkunOpen(true);
    }
  }

  function handleActionClick() {
    if (!action?.onClick) return;
    collapse();
    action.onClick();
  }

  return (
    <>
      {expanded ? (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-black/45 transition-opacity duration-300"
          aria-label="Tutup navigasi"
          onClick={collapse}
        />
      ) : null}

      <nav
        className="pointer-events-none fixed inset-x-0 bottom-5 z-30 px-4"
        aria-label="Navigasi utama"
      >
        {/*
          Anchor box spans full width so the control can animate
          from bottom-right (collapsed) to horizontal center (expanded).
        */}
        <div className="relative mx-auto h-14 w-full max-w-lg">
          <div
            className={[
              'pointer-events-auto absolute bottom-0 flex items-center overflow-hidden shadow-lg shadow-black/45 transition-all duration-300 ease-out',
              expanded
                ? `${PILL} left-1/2 -translate-x-1/2 gap-0.5 rounded-full border border-border-subtle/80 bg-bg-surface/95 py-1 pl-1.5 pr-1.5 backdrop-blur-md`
                : `${CIRCLE} right-0 translate-x-0 justify-center rounded-[4px] ring-1 ${
                    circleBusy
                      ? 'bg-bg-surface ring-border-subtle'
                      : 'bg-accent-yellow ring-black/10'
                  }`,
            ].join(' ')}
          >
            {!expanded ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="flex h-full w-full items-center justify-center text-bg-base"
                aria-expanded={false}
                aria-controls={labelId}
                aria-label={navLoading ? 'Memuat data… Buka menu navigasi' : 'Buka menu navigasi'}
                aria-busy={navLoading || circleBusy}
              >
                <NavCircleLoader isLoading={navLoading} onBusyChange={setCircleBusy} />
              </button>
            ) : (
              <>
                <div
                  id={labelId}
                  className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto scrollbar-hide"
                  style={{
                    maxWidth: `calc(${NAV_PILL_VISIBLE_SLOTS} * 3.25rem)`,
                  }}
                >
                  {PRIMARY_NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = item.match(location.pathname);

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleNavItem(item)}
                        className={[
                          'relative flex min-w-[3.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-full px-2.5 py-1.5 transition',
                          active
                            ? 'bg-accent-yellow/15 text-accent-yellow'
                            : 'text-text-muted hover:text-text-secondary',
                        ].join(' ')}
                        aria-current={active ? 'page' : undefined}
                      >
                        <Icon className="h-4 w-4" strokeWidth={active ? 2.5 : 2} />
                        <span
                          className={`text-[10px] leading-none ${
                            active ? 'font-semibold' : 'font-medium'
                          }`}
                        >
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {action ? (
                  <button
                    type="button"
                    onClick={handleActionClick}
                    className="ml-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-navy text-white shadow-sm shadow-black/30 transition hover:brightness-110 active:scale-95"
                    aria-label={action.ariaLabel}
                    title={action.label}
                  >
                    <action.icon className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </nav>

      {akunOpen ? (
        <SheetModal
          title={
            <h2 className="text-[15px] font-semibold leading-none text-text-primary">
              Akun
            </h2>
          }
          onClose={() => setAkunOpen(false)}
        >
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => goTo('/pengaturan')}
              className="flex w-full items-center gap-3 rounded-[4px] px-2 py-2.5 text-left hover:bg-bg-surface-hover"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-base text-text-secondary">
                <Settings className="h-4 w-4" />
              </span>
              <span className="flex-1 text-[13px] text-text-primary">Pengaturan</span>
              <ChevronRight className="h-4 w-4 text-text-muted" />
            </button>
            <button
              type="button"
              onClick={() => goTo('/akun')}
              className="flex w-full items-center gap-3 rounded-[4px] px-2 py-2.5 text-left hover:bg-bg-surface-hover"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-base text-text-secondary">
                <UserRound className="h-4 w-4" />
              </span>
              <span className="flex-1 text-[13px] text-text-primary">Akun</span>
              <ChevronRight className="h-4 w-4 text-text-muted" />
            </button>
          </div>
        </SheetModal>
      ) : null}
    </>
  );
}
