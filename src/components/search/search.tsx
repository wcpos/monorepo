import * as React from 'react';
import TextInput from '../textinput';
import Icon from '../icon';
import Tag from '../tag';
import * as Styled from './styles';

/**
 *
 */
export type SearchActionsProps = {
	/**
	 *
	 */
	action: () => void;
} & Pick<import('../icon/icon').IconProps, 'name'>; // pass-through props

/**
 *
 */
export type SearchFiltersProps = {
	/**
	 *
	 */
	label: string;
} & Pick<import('../tag/tag').TagProps, 'onRemove'>; // pass-through props

/**
 *
 */
export type SearchProps = {
	/**
	 * Pass-through to TextInput onChange prop
	 */
	onSearch: (value: string) => void;
	/**
	 * Buttons displayed to the right of the search field
	 */
	actions?: SearchActionsProps[];
	/**
	 * Tags displayed in the search field
	 */
	filters?: SearchFiltersProps[];
} & Pick<import('../textinput/textinput').TextInputProps, 'label' | 'value' | 'onClear'>; // pass-through props

/**
 *
 */
export const Search = ({ label, value, actions, onSearch, filters, onClear }: SearchProps) => {
	const renderFilters = React.useMemo(() => {
		if (filters) {
			return filters.map(({ label: filterLabel, onRemove }) => (
				<Tag removable onRemove={onRemove}>
					{filterLabel}
				</Tag>
			));
		}
		return undefined;
	}, [filters]);

	return (
		<Styled.Container>
			<Styled.Input>
				<TextInput
					label={label}
					hideLabel
					value={value}
					clearable
					onChange={onSearch}
					onClear={onClear}
					leftAccessory={renderFilters}
				/>
			</Styled.Input>
			{actions && (
				<Styled.Actions>
					{actions.map(({ name, action }) => (
						<Icon name={name} onPress={action} />
					))}
				</Styled.Actions>
			)}
		</Styled.Container>
	);
};
