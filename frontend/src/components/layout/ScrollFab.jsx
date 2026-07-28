import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

/** ScrollY above this → FAB becomes "scroll to top". */
const SCROLL_THRESHOLD_PX = 300;
/** Minimum overflow before FAB is shown (avoids flicker on near-fit pages). */
const MIN_OVERFLOW_PX = 48;

/**
 * Global scroll FAB (AppShell): center-bottom, only when page is scrollable.
 * Top of page → chevron-down (jump to end); past threshold → chevron-up (smooth to top).
 */
export default function ScrollFab() {
  const location = useLocation();
  const [scrollable, setScrollable] = useState(false);
  const [pastThreshold, setPastThreshold] = useState(false);

  useEffect(() => {
    function measure() {
      const root = document.documentElement;
      const overflow = root.scrollHeight - window.innerHeight;
      setScrollable(overflow > MIN_OVERFLOW_PX);
      setPastThreshold(window.scrollY > SCROLL_THRESHOLD_PX);
    }

    measure();
    // Content may settle after paint / async fetch
    const raf = requestAnimationFrame(measure);
    const t = window.setTimeout(measure, 120);

    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);

    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [location.pathname, location.search]);

  if (!scrollable) return null;

  function handleClick() {
    if (pastThreshold) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const end = Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0
    );
    window.scrollTo({ top: end, behavior: 'smooth' });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="fixed bottom-5 left-1/2 z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full bg-transparent text-accent-yellow shadow-[0_0_10px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.35)] backdrop-blur-[2px] transition hover:bg-bg-surface/15 active:scale-95"
      aria-label={pastThreshold ? 'Scroll ke atas' : 'Scroll ke bawah'}
      title={pastThreshold ? 'Ke atas' : 'Ke bawah'}
    >
      <ChevronDown
        className={`h-5 w-5 transition-transform duration-300 ease-out ${
          pastThreshold ? 'rotate-180' : 'rotate-0'
        }`}
        strokeWidth={2.5}
        aria-hidden="true"
      />
    </button>
  );
}
