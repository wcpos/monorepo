import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/select';

import { useT } from '../../../../../contexts/translations';
import { useQueryState, useQueryStateActions } from '../../../../../query';
import { useRegisterNames } from '../../../../../services/register/use-register-names';

export function RegisterPill() {
	const selected = useQueryState<'orders', string | undefined>((state) => state.filters.register);
	const actions = useQueryStateActions<'orders'>();
	const names = useRegisterNames();
	const t = useT();
	const [open, setOpen] = React.useState(false);
	const value = selected
		? { value: selected, label: names[selected] || selected.slice(0, 8) }
		: undefined;
	return (
		<Select
			value={value}
			onOpenChange={setOpen}
			onValueChange={(option) => {
				if (option) actions.setFilter('register', option.value);
			}}
		>
			<SelectPrimitiveTrigger asChild>
				<ButtonPill
					testID="order-filter-register"
					size="xs"
					variant={selected ? undefined : 'muted'}
					onPress={() => setOpen(!open)}
					removable={!!selected}
					onRemove={() => actions.clearFilter('register')}
					removeTestID="order-filter-register-remove"
				>
					<ButtonText>{value?.label || t('common.select_register')}</ButtonText>
				</ButtonPill>
			</SelectPrimitiveTrigger>
			<SelectContent>
				{Object.entries(names).map(([id, name]) => (
					<SelectItem key={id} value={id} label={name}>
						{name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
