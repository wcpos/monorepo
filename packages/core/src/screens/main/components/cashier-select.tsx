import * as React from 'react';

import {
	Combobox,
	ComboboxContent,
	ComboboxInput,
	ComboboxTrigger,
	ComboboxValue,
} from '@wcpos/components/combobox';
import type { ComboboxRootProps } from '@wcpos/components/combobox';
import { Suspense } from '@wcpos/components/suspense';

import { CustomerList } from './customer-select';
import { useT } from '../../../contexts/translations';
import { useSearchSelect } from '../../../query';

export function CashierSelect({
	portalHost,
	disabled,
	...props
}: ComboboxRootProps & { portalHost?: string }) {
	const t = useT();
	const select = useSearchSelect('cashier');
	return (
		<Combobox {...props}>
			<ComboboxTrigger testID="cashier-select-trigger" disabled={disabled}>
				<ComboboxValue placeholder={t('common.select_cashier')} />
			</ComboboxTrigger>
			<ComboboxContent portalHost={portalHost}>
				<ComboboxInput
					testID="cashier-select-search"
					placeholder={t('common.search_cashiers')}
					value={select.search}
					onChangeText={select.setSearch}
				/>
				<Suspense>
					<CustomerList select={select} withGuest={false} />
				</Suspense>
			</ComboboxContent>
		</Combobox>
	);
}
