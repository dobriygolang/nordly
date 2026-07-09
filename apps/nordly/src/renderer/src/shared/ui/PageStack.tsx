import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';

import type { PageId } from '@shared/model/navigation';

import { MOTION_MS } from '@shared/lib/motionMs';

/** Matches page-layer fade (`--motion-dur-page`, Winter MAIN fadeIn 0.4s). */
const PAGE_FADE_MS = MOTION_MS.page;

type LayerStatus = 'active' | 'entering' | 'leaving';

interface Layer {
  key: number;
  id: PageId;
  status: LayerStatus;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function PageStack({
  page,
  children,
}: {
  page: PageId;
  children: (id: PageId) => ReactNode;
}): JSX.Element {
  const layerKeyRef = useRef(0);
  const [layers, setLayers] = useState<Layer[]>(() => {
    const key = ++layerKeyRef.current;
    return [{ key, id: page, status: 'active' }];
  });
  const timerRef = useRef<number>();
  const activeRef = useRef(page);

  useEffect(() => {
    if (activeRef.current === page) return;
    activeRef.current = page;

    if (prefersReducedMotion()) {
      const key = ++layerKeyRef.current;
      setLayers([{ key, id: page, status: 'active' }]);
      return;
    }

    const key = ++layerKeyRef.current;
    setLayers((prev) => [
      ...prev.map((l) =>
        l.status === 'active' || l.status === 'entering'
          ? { ...l, status: 'leaving' as const }
          : l,
      ),
      { key, id: page, status: 'entering' as const },
    ]);

    const enterRaf = requestAnimationFrame(() => {
      setLayers((prev) =>
        prev.map((l) => (l.status === 'entering' ? { ...l, status: 'active' as const } : l)),
      );
    });

    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setLayers((prev) => prev.filter((l) => l.status !== 'leaving'));
    }, PAGE_FADE_MS);

    return () => {
      cancelAnimationFrame(enterRaf);
      window.clearTimeout(timerRef.current);
    };
  }, [page]);

  return (
    <>
      {layers.map((layer) => (
        <div
          key={layer.key}
          className="nordly-page-layer"
          data-status={layer.status}
          aria-hidden={layer.status === 'leaving' ? true : undefined}
        >
          <Suspense fallback={null}>{children(layer.id)}</Suspense>
        </div>
      ))}
    </>
  );
}
