import TopBar from './TopBar';
import ScrollFab from './ScrollFab';

/**
 * @param {{
 *   title: string,
 *   actions?: React.ReactNode,
 *   children: React.ReactNode,
 *   pageAction?: { onClick: () => void } | null,
 *   navLoading?: boolean,
 * }} props
 * pageAction: optional "+" (or similar) handler for the current page —
 * slot visibility is declared in navConfig PAGE_ACTION_SLOTS.
 * navLoading: drives morph loader on TopBar logo trigger.
 */
export default function AppShell({
  title,
  actions = null,
  children,
  pageAction = null,
  navLoading = false,
}) {
  return (
    <div className="min-h-screen bg-bg-base">
      <TopBar
        title={title}
        actions={actions}
        pageAction={pageAction}
        navLoading={navLoading}
      />
      {/* pb-20: clear the center-bottom ScrollFab */}
      <main className="mx-auto max-w-6xl px-3 pb-20 pt-1 scrollbar-hide">
        {children}
      </main>
      <ScrollFab />
    </div>
  );
}
