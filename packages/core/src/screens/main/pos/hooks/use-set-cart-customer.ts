import * as React from 'react';

import { isActiveLineItem } from '@wcpos/order-math';
import { useQueryRuntime } from '@wcpos/query';
import { GUEST_CUSTOMER_ID, POS_META_KEYS } from '@wcpos/sync-core';
import type { EngineWarning } from '@wcpos/order-math';

import { useCartConfigReader } from './use-cart-config';
import { readCatalogTaxStatuses } from './use-coupon-context';
import { retaxForCustomerWrite } from '../commands/retax-for-customer-write';
import { useCartCommand } from '../commands/use-cart-command';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';
import { useServerOwnsMoneyReader } from '../contexts/order-money-divergence';

import type { SlotWrite } from '../commands/cart-command';
import type { CurrentOrderRecord } from '../contexts/current-order';
import type { OrderPayload } from '../commands/cart-config-for-order';

type Plain = Record<string, unknown>;

export interface CartCustomerFields {
	/**
	 * The Woo customer id the order now belongs to; the guest id for a walk-in or a born-local
	 * customer. Absent, the order keeps whoever it is for (an address edit, or a picked customer
	 * whose create is not yet acknowledged and so has no id): the field is not written, and the
	 * event carries the id the order has as its queue slot starts.
	 */
	customerId?: number;
	/** An absent address is written as absent, as the forms always did. */
	billing: Plain | undefined;
	shipping: Plain | undefined;
	/** The order's own snapshot of the customer's tax ids; `null` leaves the current snapshot alone. */
	taxIds: Plain[] | null;
}

/**
 * The one writer for who the order is for: the customer id and the addresses the order carries
 * (and its tax-id snapshot), patched together inside the order's mutation queue after the
 * `cart.customer.set` hooks have seen, rewritten or refused them.
 */
export const useSetCartCustomer = () => {
	const command = useCartCommand('cart.customer.set');
	const configForOrder = useCartConfigReader();
	const serverOwnsMoney = useServerOwnsMoneyReader();
	const reportEngineWarnings = useReportEngineWarnings();
	const runtime = useQueryRuntime();

	return React.useCallback(
		async (order: CurrentOrderRecord, fields: CartCustomerFields) => {
			return (await command(
				async ({ target, dispatch }) => {
					// Read inside the slot: a stamp queued ahead (the new-customer link bridge) is the
					// customer this write keeps, not the one the form last rendered.
					const current = target.getLatest().payload.customer_id ?? null;
					// In the slot, so no later action overtakes this write while the catalog is read.
					const taxStatusFor = await readCatalogTaxStatuses(
						runtime.engine,
						(target.getLatest().payload.line_items ?? []).filter(
							(line) =>
								isActiveLineItem(line) &&
								!line.meta_data?.some(({ key }) => key === POS_META_KEYS.posData)
						)
					);
					const setsCustomer = fields.customerId !== undefined;
					const input = {
						customerId: setsCustomer ? fields.customerId! : (current ?? GUEST_CUSTOMER_ID),
						previousCustomerId: current,
						// The dispatcher's clone drops `undefined`; the write puts it back as absent.
						billing: fields.billing ?? null,
						shipping: fields.shipping ?? null,
						taxIds: fields.taxIds,
					};
					return dispatch(input, async (e, write) => {
						const intent = {
							...(setsCustomer ? { customer_id: e.payload.customerId } : {}),
							billing: e.payload.billing ?? undefined,
							shipping: e.payload.shipping ?? undefined,
							...(e.payload.taxIds ? { tax_ids: e.payload.taxIds } : {}),
						};
						let warnings: readonly EngineWarning[] = [];
						const data = (currentPayload: OrderPayload) => {
							warnings = [];
							const retaxed = retaxForCustomerWrite(currentPayload, intent, {
								configForOrder,
								ownedElsewhere: serverOwnsMoney(target.uuid),
								taxStatusFor,
							});
							warnings = retaxed.warnings;
							return { ...intent, ...retaxed.lines };
						};
						const result = await write(data);
						reportEngineWarnings(warnings, { orderId: target.uuid, site: 'useSetCartCustomer' });
						return result;
					});
				},
				(record) => ({ orderId: record.uuid, customerId: fields.customerId ?? null }),
				order
			)) as Awaited<ReturnType<SlotWrite>> | false;
		},
		[command, configForOrder, serverOwnsMoney, reportEngineWarnings, runtime]
	);
};
