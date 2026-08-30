/**
 * How much failure it takes before the app declares the website unavailable.
 *
 * One failed ping is not evidence that the store is down (#1669). A 502 from a
 * proxy, one dropped request or a single timeout used to be enough to tell the
 * cashier mid-sale that the website is unreachable — and to park the request
 * queue offline — while orders and product fetches were going through fine.
 *
 * Both providers therefore require sustained failure before that verdict.
 * Recovery is never gated: the first successful ping restores the status
 * immediately and clears any pending failure evidence.
 */

/**
 * Web/Electron probe on a discrete schedule, so confirmation counts probes:
 * two consecutive failures, each of which is already a HEAD followed by a GET.
 * The probe interval is 30s, so this is ~30s of unbroken failure, matching the
 * native window below.
 */
export const WEBSITE_UNAVAILABLE_CONFIRMATION_PROBES = 2;

/**
 * NetInfo only notifies on a *change*, so while `isInternetReachable` stays
 * false the native provider never sees the individual retries and cannot count
 * them — it confirms by duration instead. The guarantee is "no ping has
 * succeeded for 30s": NetInfo re-probes every 5s in that state, so a fast
 * failure is retried several times inside the window, and a transient blip
 * clears on the very next probe long before it closes. (A hung request is only
 * failed at the provider's 60s `reachabilityRequestTimeout`, so there the
 * window means exactly what it says — half a minute of silence.)
 */
export const WEBSITE_UNAVAILABLE_CONFIRMATION_MS = 30_000;
