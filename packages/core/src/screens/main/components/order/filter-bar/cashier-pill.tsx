import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Combobox,
	ComboboxContent,
	ComboboxInput,
	ComboboxTrigger,
} from '@wcpos/components/combobox';
import { Suspense } from '@wcpos/components/suspense';
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { useQueryState, useQueryStateActions, useSearchSelect } from '../../../../../query';
import { parseRemoteId } from '../../../../../utils/parse-remote-id';
import { useCustomerNameFormat } from '../../../hooks/use-customer-name-format';
import { CustomerList } from '../../customer-select';
import { isIdOnlyCustomerEntity } from './customer-filter-utils';

import type { CustomerData } from '../../../hooks/use-customer-name-format/helpers';

interface CashierPillProps {
	resource: ObservableResource<EngineRecord<'customers'> | null>;
	onMissing?: () => void;
}

/**
 * Cashier Search
 */
function CashierSearch() {
	const t = useT();
	const binding = useSearchSelect('cashier');

	/**
	 *
	 */
	return (
		<>
			<ComboboxInput
				placeholder={t('common.search_cashiers')}
				value={binding.search}
				onChangeText={binding.setSearch}
			/>
			<Suspense>
				<CustomerList binding={binding} withGuest={false} />
			</Suspense>
		</>
	);
}

/**
 *
 */
export function CashierPill({ resource, onMissing }: CashierPillProps) {
	const cashierID = useQueryState<'orders', string | number | undefined>(
		(state) => state.filters.cashier
	);
	const actions = useQueryStateActions<'orders'>();
	const resolvedCashier = useObservableSuspense(resource);
	let cashier = resolvedCashier?.payload;
	const { format } = useCustomerNameFormat();
	const t = useT();
	const isActive = cashierID !== null && cashierID !== undefined;

	React.useEffect(() => {
		// Missing labels escalate through the engine demand seam after the resident lookup settles.
		if (isActive && !resolvedCashier) onMissing?.();
	}, [isActive, onMissing, resolvedCashier]);

	/**
	 * @FIXME - if the customers are cleared, it's possible that the cashier will be null
	 */
	if (!cashier && isActive) {
		cashier = { id: parseRemoteId(cashierID) };
	}
	const cashierEntity = isActive ? cashier : null;
	const isLoading = isActive && isIdOnlyCustomerEntity(cashierEntity);

	const handleRemove = React.useCallback(() => {
		actions.clearFilter('cashier');
	}, [actions]);

	return (
		<Combobox<CustomerData>
			onValueChange={(option) => {
				if (!option) return;
				const cashierID = parseRemoteId(option.value);
				if (cashierID === undefined) return;
				actions.setFilter('cashier', cashierID);
			}}
		>
			<ComboboxTrigger asChild>
				<ButtonPill
					testID="order-filter-cashier"
					size="xs"
					leftIcon="userCrown"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={handleRemove}
					removeTestID="order-filter-cashier-remove"
				>
					<ButtonText>
						{isLoading
							? t('common.loading')
							: cashierEntity
								? format(cashierEntity)
								: t('common.select_cashier')}
					</ButtonText>
				</ButtonPill>
			</ComboboxTrigger>
			<ComboboxContent>
				<CashierSearch />
			</ComboboxContent>
		</Combobox>
	);
}
