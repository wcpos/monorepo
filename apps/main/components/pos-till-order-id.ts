/**
 * The order id the (pos) layout hands the current-order provider for one render.
 *
 * A sheet (`(modals)/…`: checkout, receipt) carries the order it was opened for, but it is not
 * the till. Delivering its id released the Cart tab's parked order, and popping the sheet then
 * re-delivered that order as a navigation (#3148 review). While a sheet is focused the provider
 * keeps the id the till route delivered last; outside the POS group the remembered cart id holds.
 */
export function tillOrderIdForRoute(input: {
	segments: string[];
	orderIdFromParams: string | undefined;
	/** The id the till route delivered last (state owned by the layout). */
	tillOrderId: string | undefined;
	/** The layout's existing `lastOrderId` (remembered for routes outside the POS group). */
	lastOrderId: string | undefined;
}): { orderId: string | undefined; tillOrderId: string | undefined } {
	const inPos = input.segments.includes('(pos)');
	const inSheet = input.segments.includes('(modals)');
	const tillOrderId = inPos && !inSheet ? input.orderIdFromParams : input.tillOrderId;
	const orderId = !inPos ? input.lastOrderId : inSheet ? tillOrderId : input.orderIdFromParams;
	return { orderId, tillOrderId };
}
