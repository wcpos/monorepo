import * as React from 'react';

import { FormItem, SavedMark, useSavedName } from '@wcpos/components/form';
import { PropertyRow } from '@wcpos/components/property-row';
import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

/**
 * One order fact (the Edit tab, the cart's Order details): its control in the value slot, named
 * by the row's key. The row's verb hides while its Saved mark shows.
 */
export function OrderRow(props: {
	prefix: 'order' | 'order-meta';
	id: string;
	label: string;
	mark?: string;
	align?: 'top';
	verb?: React.ReactNode;
	children: React.ReactNode;
}) {
	const { prefix, id, mark } = props;
	const t = useT();
	const saved = useSavedName();
	const marked = !!mark && saved === mark;
	return (
		<PropertyRow
			testID={`${prefix}-row-${id}`}
			label={props.label}
			align={props.align}
			nativeID={`${prefix}-${id}-form-item`}
			trailing={marked ? <SavedMark name={mark} label={t('settings.saved')} /> : props.verb}
		>
			<FormItem nativeID={`${prefix}-${id}`}>{props.children}</FormItem>
		</PropertyRow>
	);
}

/**
 * An order's currency is never empty, so it is no presence fact: it is a row while it differs
 * from the store's, or once its add button asked for it, and stays one for the dialog's life
 * (changing it back never pulls the row from under the cashier). It has no Remove.
 */
export function useCurrencyRow(currency: string | undefined) {
	const { store } = useStoreSession();
	const storeCurrency = useDocField(store, (value) => value.currency);
	const differs = !!currency && !!storeCurrency && currency !== storeCurrency;
	const [shown, setShown] = React.useState(differs);
	// A differing currency that arrives later keeps its row: adjusted during render, not an effect.
	if (differs && !shown) setShown(true);
	return { shown, show: () => setShown(true) };
}
