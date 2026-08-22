import { useVariationParentRefresh } from '../hooks/use-variation-parent-refresh';

/**
 * Re-fetches a variable product whenever one of its variations is acknowledged
 * by the server, so the price range it renders never lags its children (#1495).
 *
 * Mounted beside the other engine bridges, inside the QueryProvider, for the
 * lifetime of the app session — NOT on the Products screen. A price edit made
 * offline is acknowledged whenever it eventually drains, which is routinely
 * after the cashier has navigated away, and can be after a relaunch.
 */
export function VariationParentBridge() {
	useVariationParentRefresh();
	return null;
}
