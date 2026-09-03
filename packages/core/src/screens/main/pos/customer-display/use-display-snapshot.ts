import * as React from 'react';

import { readLedger } from '@wcpos/order-math';
import { formatReceiptData } from '@wcpos/printer/encoder/format-receipt-data';
import { useDocField, useRecordField } from '@wcpos/query';

import { useAppState } from '../../../../contexts/app-state';
import { buildLedger } from '../../../../services/customer-display';
import { useTaxSettingsOptional } from '../../contexts/tax-rates/provider';
import { resolvePriceNumDecimals } from '../../contexts/tax-rates/resolve-price-num-decimals';
import { useOrderStatusLabel } from '../../hooks/use-order-status-label';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { buildReceiptData } from '../../receipt/utils/build-receipt-data';
import { useCurrentOrder } from '../contexts/current-order';

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
	const rows = React.useMemo(() => readLedger(orderData?.meta_data), [orderData?.meta_data]);
	const order = React.useMemo(() => {
		if (!orderData || !storeData) return null;
		const receiptData = buildReceiptData(orderData, storeData, dp, {
			getStatusLabel,
			receiptI18n,
		});
		// The local builder predates printer ReceiptData's required line tax array. The formatter
		// maps it unconditionally, so bridge only that runtime requirement without inventing taxes.
		const formatInput = {
			...receiptData,
			lines: receiptData.lines.map((line) => ({ ...line, taxes: [] })),
		};
		return formatReceiptData(formatInput as unknown as Parameters<typeof formatReceiptData>[0]);
	}, [orderData, storeData, dp, getStatusLabel, receiptI18n]);
	const ledger = React.useMemo(() => {
		if (!orderData || !storeData) return null;
		const currency = String(orderData.currency || storeData.currency || '');
		const locale =
			typeof storeData.locale === 'string' && storeData.locale ? storeData.locale : 'en_US';
		return buildLedger(rows, Number(orderData.total) || 0, currency, locale, methodTitles, dp);
	}, [orderData, storeData, rows, dp, methodTitles]);

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
}
