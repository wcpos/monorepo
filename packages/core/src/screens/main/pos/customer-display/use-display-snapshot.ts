import * as React from 'react';

import { readLedger } from '@wcpos/order-math';
import { useDocField, useRecordField } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useAppState } from '../../../../contexts/app-state';
import { buildLedger } from '../../../../services/customer-display';
import { useTaxSettingsOptional } from '../../contexts/tax-rates/provider';
import { resolvePriceNumDecimals } from '../../contexts/tax-rates/resolve-price-num-decimals';
import { useOrderStatusLabel } from '../../hooks/use-order-status-label';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { buildReceiptData } from '../../receipt/utils/build-receipt-data';
import { useCurrentOrder } from '../contexts/current-order';

const logger = getLogger(['wcpos', 'customer-display', 'snapshot']);

export function useDisplaySnapshot() {
	const { currentOrderRecord } = useCurrentOrder();
	const { store } = useAppState();
	const orderUuid = useRecordField(currentOrderRecord, (value) => value.uuid);
	const orderData = useRecordField(currentOrderRecord, (value) => value.payload);
	const storeData = useDocField(store, (value) => value);
	const taxSettings = useTaxSettingsOptional();
	const storeDp = useDocField(store, (value) => value.wc_price_decimals) as number | undefined;
	const dp = resolvePriceNumDecimals({
		contextDp: taxSettings?.priceNumDecimals,
		storeDp,
	});
	const receiptI18n = useDocField(store, (value) => value.receipt_i18n) as
		Record<string, string> | undefined;
	const { getLabel: getStatusLabel } = useOrderStatusLabel();
	const { byId } = usePaymentMethods();

	const methodTitles = React.useMemo(
		() => new Map([...byId].map(([id, method]) => [id, method.title])),
		[byId]
	);
	const loggedFailures = React.useRef(new Set<string>());
	const rows = React.useMemo(() => readLedger(orderData?.meta_data), [orderData?.meta_data]);
	const orderBuild = React.useMemo(() => {
		if (!orderData || !storeData) return { value: null, failed: false };
		try {
			return {
				value: buildReceiptData(orderData, storeData, dp, { getStatusLabel, receiptI18n }),
				failed: false,
			};
		} catch {
			return { value: null, failed: true };
		}
	}, [orderData, storeData, dp, getStatusLabel, receiptI18n]);
	const ledgerBuild = React.useMemo(() => {
		if (!orderData || !storeData) return { value: null, failed: false };
		try {
			const currency = String(orderData.currency || storeData.currency || '');
			const locale =
				typeof storeData.locale === 'string' && storeData.locale ? storeData.locale : 'en_US';
			return {
				value: buildLedger(rows, Number(orderData.total) || 0, currency, locale, methodTitles, dp),
				failed: false,
			};
		} catch {
			return { value: null, failed: true };
		}
	}, [orderData, storeData, rows, dp, methodTitles]);
	const { value: order } = orderBuild;
	const { value: ledger } = ledgerBuild;
	const buildFailed = orderBuild.failed || ledgerBuild.failed;
	// Logging is an external side effect; keep it out of the render-time snapshot memos.
	React.useEffect(() => {
		if (!buildFailed || !orderUuid || loggedFailures.current.has(orderUuid)) return;
		loggedFailures.current.add(orderUuid);
		logger.error('Customer display snapshot build failed', {
			code: ERROR_CODES.CUSTOMER_DISPLAY_SNAPSHOT_FAILED,
			context: { orderUuid },
		});
	}, [buildFailed, orderUuid]);

	return React.useMemo(() => {
		if (!order || !ledger || !orderData || !orderUuid) return null;
		return {
			orderUuid,
			orderStatus: String(orderData.status ?? ''),
			rows,
			order,
			ledger,
			isEmpty:
				(orderData.line_items?.length ?? 0) === 0 &&
				(orderData.fee_lines?.length ?? 0) === 0 &&
				(orderData.shipping_lines?.length ?? 0) === 0,
			hasCoupons: (orderData.coupon_lines?.length ?? 0) > 0,
		};
	}, [orderUuid, orderData, order, ledger, rows]);
}
