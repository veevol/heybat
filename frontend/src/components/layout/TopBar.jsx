import { useEffect, useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, LogOut, Settings, Shield, UserRound } from 'lucide-react';
import SheetModal from '../SheetModal';
import { useAuth } from '../../context/AuthContext';
import { canSeeMenu } from '../../lib/permissions';
import NavCircleLoader from './NavCircleLoader';
import { PRIMARY_NAV_ITEMS, resolvePageAction } from './navConfig';

/**
 * Sticky top bar: logo = nav trigger + loading morph; title; page actions.
 * Expanded menu drops from top-left under the logo.
 */
export default function TopBar({
  title,
  actions = null,
  pageAction = null,
  navLoading = false,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [akunOpen, setAkunOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const labelId = useId();

  const action = resolvePageAction(location.pathname, pageAction);
  const isOwner = profile?.is_owner === true;
  const navItems = PRIMARY_NAV_ITEMS.filter((item) =>
    canSeeMenu(profile, item.menuKode)
  );

  useEffect(() => {
    if (!expanded) return undefined;

    function onKey(e) {
      if (e.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

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

  async function handleLogout() {
    setLogoutBusy(true);
    try {
      await signOut();
      setAkunOpen(false);
      navigate('/login', { replace: true });
    } catch {
      setLogoutBusy(false);
    }
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
      <header className="sticky top-0 z-30 bg-gradient-to-b from-bg-surface/80 via-bg-base/70 to-bg-base/0 backdrop-blur-md">
        <div className="relative mx-auto flex h-12 max-w-6xl items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] transition hover:bg-bg-surface-hover"
              aria-expanded={expanded}
              aria-controls={labelId}
              aria-label={
                navLoading
                  ? 'Memuat data… Buka menu navigasi'
                  : expanded
                    ? 'Tutup menu navigasi'
                    : 'Buka menu navigasi'
              }
              aria-busy={navLoading}
            >
              <NavCircleLoader isLoading={navLoading} size="sm" />
            </button>
            <h1 className="truncate text-[15px] font-semibold leading-none text-text-primary">
              {title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">{actions}</div>

          {expanded ? (
            <nav
              id={labelId}
              className="absolute left-3 top-[calc(100%-2px)] z-40 w-[min(15.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-[4px] border border-border-subtle/80 bg-bg-surface/95 p-1 shadow-lg shadow-black/45 backdrop-blur-md"
              aria-label="Navigasi utama"
            >
              <div className="flex max-h-[min(70vh,28rem)] flex-col gap-0.5 overflow-y-auto scrollbar-hide">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = item.match(location.pathname);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavItem(item)}
                      className={[
                        'flex w-full shrink-0 items-center gap-3 rounded-[4px] px-2.5 py-2.5 text-left transition',
                        active
                          ? 'bg-accent-yellow/15 text-accent-yellow'
                          : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary',
                      ].join(' ')}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon
                        className="h-5 w-5 shrink-0"
                        strokeWidth={active ? 2.25 : 1.75}
                      />
                      <span
                        className={`truncate text-[13px] leading-none ${
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
                  className="mt-0.5 flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-[4px] bg-accent-navy text-white shadow-sm shadow-black/30 transition hover:brightness-110 active:scale-[0.98]"
                  aria-label={action.ariaLabel}
                  title={action.label}
                >
                  <action.icon className="h-4 w-4" strokeWidth={2.5} />
                  <span className="text-[13px] font-semibold">{action.label}</span>
                </button>
              ) : null}
            </nav>
          ) : null}
        </div>
      </header>

      {expanded ? (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-black/45 transition-opacity duration-300"
          aria-label="Tutup navigasi"
          onClick={collapse}
        />
      ) : null}

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
            {isOwner ? (
              <button
                type="button"
                onClick={() => goTo('/kelola-akses')}
                className="flex w-full items-center gap-3 rounded-[4px] px-2 py-2.5 text-left hover:bg-bg-surface-hover"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-base text-accent-yellow">
                  <Shield className="h-4 w-4" />
                </span>
                <span className="flex-1 text-[13px] text-text-primary">
                  Kelola Akses
                </span>
                <ChevronRight className="h-4 w-4 text-text-muted" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => goTo('/pengaturan')}
              className="flex w-full items-center gap-3 rounded-[4px] px-2 py-2.5 text-left hover:bg-bg-surface-hover"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-base text-text-secondary">
                <Settings className="h-4 w-4" />
              </span>
              <span className="flex-1 text-[13px] text-text-primary">
                Pengaturan
              </span>
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
            <button
              type="button"
              onClick={handleLogout}
              disabled={logoutBusy}
              className="flex w-full items-center gap-3 rounded-[4px] px-2 py-2.5 text-left hover:bg-state-error/10 disabled:opacity-60"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-base text-state-error">
                <LogOut className="h-4 w-4" />
              </span>
              <span className="flex-1 text-[13px] font-medium text-state-error">
                {logoutBusy ? 'Keluar…' : 'Keluar'}
              </span>
            </button>
          </div>
        </SheetModal>
      ) : null}
    </>
  );
}
