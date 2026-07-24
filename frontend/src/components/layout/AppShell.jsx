import BottomNav from './BottomNav';
import TopBar from './TopBar';

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
 * navLoading: drives morph loader on collapsed Bottom Nav circle.
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
      <TopBar title={title} actions={actions} />
      {/* Extra bottom padding so content clears the floating nav control */}
      <main className="mx-auto max-w-6xl px-3 pb-28 pt-1 scrollbar-hide">{children}</main>
      <BottomNav pageAction={pageAction} navLoading={navLoading} />
    </div>
  );
}
