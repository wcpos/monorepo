import { BehaviorSubject } from 'rxjs';

/**
 * One in-flight flag shared by every full manual-sync control. Row checks use the
 * collection subject below, and both operations refuse to start while either is active.
 * Transient by construction (true only while a sync promise is in flight), so it never
 * carries stale state across store switches.
 */
export const manualSyncInFlight$ = new BehaviorSubject(false);
