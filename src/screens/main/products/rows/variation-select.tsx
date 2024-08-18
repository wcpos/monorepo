import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { Query } from '@wcpos/query';
import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';
import { Select, SelectContent, SelectItem, SelectPrimitive } from '@wcpos/tailwind/src/select';

import { useT } from '../../../../contexts/translations';

type ProductCollection = import('@wcpos/database').ProductCollection;

/**
 *
 */
export const VariationSelect = ({ attribute, selected }) => {
	const t = useT();
	const isActive = !!selected;

	/**
	 *
	 */
	return (
		<Select
			value={{ value: selected, label: selected }}
			onValueChange={({ value }) => console.log(value)}
		>
			<SelectPrimitive.Trigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="check"
					variant={isActive ? 'default' : 'secondary'}
					removable={isActive}
					onRemove={() => {}}
				>
					<ButtonText>{attribute.name}</ButtonText>
				</ButtonPill>
			</SelectPrimitive.Trigger>
			<SelectContent>
				{(attribute.options || []).map((option) => (
					<SelectItem key={option} label={option} value={option} />
				))}
			</SelectContent>
		</Select>
	);
};
