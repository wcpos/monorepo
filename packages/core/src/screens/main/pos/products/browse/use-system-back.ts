/**
 * The system's own back (Android's back gesture and button) for the browse stack: `handle`
 * answers whether it went back. Only Android has one (use-system-back.android.ts); iOS and the
 * web go back through the crumb, Escape and the edge swipe (`LevelBack`).
 */
export function useSystemBack(_handle: () => boolean): void {}
