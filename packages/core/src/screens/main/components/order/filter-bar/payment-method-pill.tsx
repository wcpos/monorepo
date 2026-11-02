import * as React from 'react';

import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
	SelectSeparator,
} from '@wcpos/components/select';

import { FilterChip as Chip } from './chip';
import { useT } from '../../../../../contexts/translations';
import { useQueryState, useQueryStateActions } from '../../../../../query';
import { usePaymentMethodOptions } from '../../../hooks/use-payment-method-options';

export function PaymentMethodPill() {
	const selected = useQueryState<'orders', string | undefined>(
		(state) => state.filters.payment_method
	);
	const actions = useQueryStateActions<'orders'>();
	const t = useT();
	const isActive = !!selected;
	const { groups, getLabel } = usePaymentMethodOptions();
	const value = selected ? { value: selected, label: getLabel(selected) } : undefined;

	return (
		<Select
			value={value}
			onValueChange={(option) => option && actions.setFilter('payment_method', option.value)}
		>
			<SelectPrimitiveTrigger asChild>
				<Chip
					clearLabel={t('common.remove')}
					clearTestID="order-filter-payment-method-remove"
					testID="order-filter-payment-method"
					icon="card"
					on={isActive}
					onClear={isActive ? () => actions.clearFilter('payment_method') : undefined}
					label={value?.label || t('common.payment_method')}
				/>
			</SelectPrimitiveTrigger>
			<SelectContent>
				{groups.map((group, index) => (
					<React.Fragment key={group[0].kind}>
						{index > 0 && <SelectSeparator />}
						{group.map((item) => (
							<SelectItem
								key={item.value}
								testID={`order-filter-payment-method-${item.value}`}
								label={item.label}
								value={item.value}
							/>
						))}
					</React.Fragment>
				))}
				{groups.length === 0 && (
					<SelectItem disabled value="empty" label={t('common.no_payment_methods_found')} />
				)}
			</SelectContent>
		</Select>
	);
}
