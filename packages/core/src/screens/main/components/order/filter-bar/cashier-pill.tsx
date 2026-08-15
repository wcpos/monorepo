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
import type { CustomerDocument } from '@wcpos/database';

import { useT } from '../../../../../contexts/translations';
import { useQueryState, useQueryStateActions, useSearchSelect } from '../../../../../query';
import { parseRemoteId } from '../../../../../utils/parse-remote-id';
import { useCustomerNameFormat } from '../../../hooks/use-customer-name-format';
import { CustomerList } from '../../customer-select';
import { isIdOnlyCustomerEntity } from './customer-filter-utils';

interface CashierPillProps {
	resource: ObservableResource<CustomerDocument>;
	onMissing?: () => void;
}

type CashierWithLoadingMarker = CustomerDocument & { __isLoading?: boolean };

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
				<CustomerList resource={binding.resource} withGuest={false} />
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
	let cashier = resolvedCashier;
	const { format } = useCustomerNameFormat();
	const t = useT();
	const isCashierLoading = (cashier as CashierWithLoadingMarker | null)?.__isLoading;
	const isActive = cashierID !== null && cashierID !== undefined;

	React.useEffect(() => {
		// Missing labels escalate through the engine demand seam after the resident lookup settles.
		if (isActive && !resolvedCashier) onMissing?.();
	}, [isActive, onMissing, resolvedCashier]);

	/**
	 * @FIXME - if the customers are cleared, it's possible that the cashier will be null
	 */
	if (!cashier && isActive) {
		cashier = { id: cashierID } as CustomerDocument;
	}
	const cashierEntity = isActive ? cashier : null;
	const isLoading = isActive && (!!isCashierLoading || isIdOnlyCustomerEntity(cashierEntity));

	const handleRemove = React.useCallback(() => {
		actions.clearFilter('cashier');
	}, [actions]);

	return (
		<Combobox
			onValueChange={(option) => {
				if (!option) return;
				const cashierID = parseRemoteId(option.value);
				if (cashierID === undefined) return;
				actions.setFilter('cashier', cashierID);
			}}
		>
			<ComboboxTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="userCrown"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={handleRemove}
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
