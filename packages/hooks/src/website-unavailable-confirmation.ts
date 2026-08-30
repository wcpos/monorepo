/**
 * How much failure it takes before the app declares the website unavailable.
 *
 * One failed ping is not evidence that the store is down (#1669). A 502 from a
 * proxy, one dropped request or a single timeout used to be enough to tell the
 * cashier mid-sale that the website is unreachable — and to park the request
 * queue offline — while orders and product fetches were going through fine.
 *
 * Both providers require the same thing before that verdict: the ping must have
 * been failing, without a single success, for the confirmation window below.
 * Recovery is never gated — the first successful ping (or a network pulse from
 * live traffic) restores the status immediately and drops the failure evidence,
 * as does a change of store URL, whose evidence belongs to the previous site.
 */

/**
 * Elapsed failure required before the verdict, on every platform.
 *
 * The guarantee is "no ping has succeeded for 30s", not "N pings failed", so it
 * holds however each platform schedules its probes: web/Electron re-probe every
 * 30s, and NetInfo re-probes every 5s while `isInternetReachable` is false
 * (which it never re-notifies about, so native cannot count probes at all). A
 * transient blip clears on the very next probe, long before the window closes.
 */
export const WEBSITE_UNAVAILABLE_CONFIRMATION_MS = 30_000;

/**
 * Slack for comparing elapsed failure on the web side, where the check is made
 * when a probe resolves rather than by a timer. The probe scheduled one
 * interval after the first failure can resolve a hair inside the window (the
 * two probes need not take the same time), and without this the verdict would
 * silently slip to the probe after that. It is orders of magnitude smaller than
 * the 30s interval, so checks queued back-to-back — an `online` and a
 * `visibilitychange` both firing on wake — can never confirm each other.
 */
export const WEBSITE_UNAVAILABLE_CONFIRMATION_TOLERANCE_MS = 1_000;
