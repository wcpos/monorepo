import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { HStack } from '@wcpos/components/hstack';
import { Query } from '@wcpos/query';
import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/select';

import { useT } from '../../../contexts/translations';

const items = [
	{ value: 'info', label: 'Info' },
	{ value: 'warning', label: 'Warning' },
	{ value: 'error', label: 'Error' },
];

export function FilterBar({ query }: { query: Query<any> }) {
	const selected = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('level')))
	);
	const t = useT();
	const isActive = !!selected;

	/**
	 * NOTE: if value changes from { value: 'example', label: 'example' } to undefined,
	 * it won't clear the previous value, so we need to make sure we return { value: '', label: '' }
	 */
	const value = React.useMemo(() => {
		const val = items.find((item) => item.value === selected);
		return val ? val : { value: '', label: '' };
	}, [selected]);

	return (
		<HStack className="w-full flex-wrap">
			<Select
				value={value}
				onValueChange={({ value }) => query.where('level').equals(value).exec()}
			>
				<SelectPrimitiveTrigger asChild>
					<ButtonPill
						size="xs"
						leftIcon="folder"
						variant={isActive ? undefined : 'muted'}
						removable={isActive}
						onRemove={() => query.removeWhere('level').exec()}
					>
						<ButtonText decodeHtml>{value?.label || t('Log Level', { _tags: 'core' })}</ButtonText>
					</ButtonPill>
				</SelectPrimitiveTrigger>
				<SelectContent>
					{items.map((item) => (
						<SelectItem key={item.label} label={item.label} value={item.value} />
					))}
				</SelectContent>
			</Select>
		</HStack>
	);
}
