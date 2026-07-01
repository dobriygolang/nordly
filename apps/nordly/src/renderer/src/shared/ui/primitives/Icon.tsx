// Icon — hand-rolled SVG sprites for the ~dozen glyphs Nordly uses. Inline
// on purpose: ~400 bytes of SVG beats the runtime cost of a sprite sheet
// at this count, and the design language here is minimal enough that we
// rarely add new icons.
//
// New icons land by extending the switch. Size defaults to 14px to match
// the body font; callers pass explicit size only when breaking from that.

export type IconName =
  | 'menu'
  | 'play'
  | 'pause'
  | 'sun'
  | 'note'
  | 'grid'
  | 'calendar'
  | 'bars'
  | 'search'
  | 'infinity'
  | 'pomodoro'
  | 'reset'
  | 'link'
  | 'unlink'
  | 'settings'
  | 'trash'
  | 'external'
  | 'lock'
  | 'chevron-left'
  | 'chevron-right'
  | 'plus'
  | 'file'
  | 'more'
  | 'copy'
  | 'video'
  | 'check'
  | 'play-outline';

interface IconProps {
  name: IconName;
  size?: number;
  stroke?: string;
  /** Override default 1.4 stroke. Useful at small sizes where a slightly
   * heavier stroke (1.6-2) reads better, or for emphasis. */
  strokeWidth?: number;
}

export function Icon({ name, size = 14, stroke = 'currentColor', strokeWidth = 1.4 }: IconProps) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'menu':
      return (
        <svg {...p}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case 'play':
      return (
        <svg {...p}>
          <path d="M7 5l13 7-13 7z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'pause':
      return (
        <svg {...p}>
          <rect x="7" y="5" width="3" height="14" fill="currentColor" stroke="none" />
          <rect x="14" y="5" width="3" height="14" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'sun':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
        </svg>
      );
    case 'note':
      return (
        <svg {...p}>
          <path d="M5 4h11l3 3v13H5z" />
          <path d="M16 4v3h3" />
          <path d="M8 11h8M8 15h6" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...p}>
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="7" rx="1" />
          <rect x="4" y="13" width="7" height="7" rx="1" />
          <rect x="13" y="13" width="7" height="7" rx="1" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...p}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 10h16M9 3v4M15 3v4" />
        </svg>
      );
    case 'bars':
      return (
        <svg {...p}>
          <path d="M5 20V11M12 20V4M19 20v-6" />
        </svg>
      );
    case 'search':
      return (
        <svg {...p}>
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4-4" />
        </svg>
      );
    case 'infinity':
      return (
        <svg {...p}>
          <path d="M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8" />
        </svg>
      );
    case 'pomodoro':
      return (
        <svg {...p}>
          <path d="M12 3c-1.5 0-2.5 1-2.5 2.5 0 0 0 0 0 0-2.5 0-4.5 2-4.5 4.5 0 4.5 3 8 7 8s7-3.5 7-8c0-2.5-2-4.5-4.5-4.5 0 0 0 0 0 0C14.5 4 13.5 3 12 3z" />
          <path d="M12 3v2" />
        </svg>
      );
    case 'reset':
      return (
        <svg {...p}>
          <path d="M4 4v5h5" />
          <path d="M4 9a8 8 0 1 1 2.3 5.7" />
        </svg>
      );
    case 'link':
      return (
        <svg {...p}>
          <path d="M10 14a4 4 0 005.6 0l3-3a4 4 0 00-5.6-5.6l-1 1M14 10a4 4 0 00-5.6 0l-3 3a4 4 0 005.6 5.6l1-1" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...p}>
          <path d="M3 6h18" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case 'unlink':
      return (
        <svg {...p}>
          <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.71 1.71" />
          <path d="M5.16 11.75l-1.71 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71" />
          <path d="M2 2l20 20" />
        </svg>
      );
    case 'external':
      return (
        <svg {...p}>
          <path d="M14 4h6v6" />
          <path d="M20 4l-8 8" />
          <path d="M16 14v6H4V8h6" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...p}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case 'chevron-left':
      return (
        <svg {...p}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      );
    case 'chevron-right':
      return (
        <svg {...p}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...p}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'file':
      return (
        <svg {...p}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      );
    case 'more':
      return (
        <svg {...p} fill="currentColor" stroke="none">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...p}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      );
    case 'video':
      return (
        <svg {...p}>
          <rect x="3" y="7" width="13" height="10" rx="2" />
          <path d="M16 10l5-3v10l-5-3" />
        </svg>
      );
    case 'check':
      return (
        <svg {...p}>
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      );
    case 'play-outline':
      return (
        <svg {...p}>
          <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
        </svg>
      );
  }
}
