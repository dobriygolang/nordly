import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Matches the full-screen layer transition (`--motion-dur-large`) in globals.css. */
const SCREEN_FADE_MS = 440;

type LayerStatus = 'active' | 'entering' | 'leaving';

interface Layer {
  id: string;
  status: LayerStatus;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Top-level crossfade between whole app screens (loading / login / signed-in
 * shell). Mirrors PageStack but uses fixed full-screen layers so the login →
 * app handoff settles instead of hard-swapping.
 */
export function ScreenFade({
  screen,
  children,
}: {
  screen: string;
  children: (id: string) => ReactNode;
}): JSX.Element {
  const [layers, setLayers] = useState<Layer[]>([{ id: screen, status: 'active' }]);
  const timerRef = useRef<number>();
  const activeRef = useRef(screen);

  useEffect(() => {
    if (activeRef.current === screen) return;
    activeRef.current = screen;

    if (prefersReducedMotion()) {
      setLayers([{ id: screen, status: 'active' }]);
      return;
    }

    setLayers((prev) => [
      ...prev.map((l) =>
        l.status === 'active' || l.status === 'entering'
          ? { ...l, status: 'leaving' as const }
          : l,
      ),
      { id: screen, status: 'entering' as const },
    ]);

    const enterRaf = requestAnimationFrame(() => {
      setLayers((prev) =>
        prev.map((l) => (l.status === 'entering' ? { ...l, status: 'active' as const } : l)),
      );
    });

    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setLayers((prev) => prev.filter((l) => l.status !== 'leaving'));
    }, SCREEN_FADE_MS);

    return () => {
      cancelAnimationFrame(enterRaf);
      window.clearTimeout(timerRef.current);
    };
  }, [screen]);

  return (
    <>
      {layers.map((layer) => (
        <div
          key={layer.id}
          className="nordly-screen-layer"
          data-status={layer.status}
          aria-hidden={layer.status === 'leaving' ? true : undefined}
        >
          {children(layer.id)}
        </div>
      ))}
    </>
  );
}
