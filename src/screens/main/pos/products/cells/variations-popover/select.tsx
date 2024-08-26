import * as React from 'react';

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/src/select';

import { useT } from '../../../../../../contexts/translations';
/**
 *
 */
const VariationSelect = ({ attribute, onSelect, selectedOption }) => {
	const t = useT();

	return (
		<Select onValueChange={onSelect} value={selectedOption}>
			<SelectTrigger className="w-[250px]">
				<SelectValue
					className="text-foreground text-sm native:text-lg"
					placeholder={t('Select an option', { _tags: 'core' })}
				/>
			</SelectTrigger>
			<SelectContent className="w-[250px]">
				<SelectGroup>
					{attribute.options.map((option) => (
						<SelectItem key={option} label={option} value={option}>
							Apple
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
};

export default VariationSelect;
