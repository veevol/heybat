import AppShell from '../components/layout/AppShell';

export default function PlaceholderPage({ title, body }) {
  return (
    <AppShell title={title}>
      <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center">
        <p className="text-[13px] text-text-secondary">{body}</p>
      </div>
    </AppShell>
  );
}
