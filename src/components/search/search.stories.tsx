import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { Search, SearchProps } from './search';

export default {
	title: 'Components/Search',
	component: Search,
};

export const BasicUsage = (props: SearchProps) => {
	const [value, setValue] = React.useState('');

	const handleSearch = (val: string) => {
		props.onSearch(val);
		setValue(val);
	};

	return <Search {...props} onSearch={handleSearch} value={value} />;
};
BasicUsage.args = {
	label: 'Search',
	onSearch: action('Search'),
	onClear: action('Clear'),
	placeholder: 'Placeholder',
	actions: [
		{ name: 'add', action: action('Add Pressed') },
		{ name: 'cog', action: action('Cog Pressed') },
	],
	filters: [
		{ label: 'Music', onRemove: action('Remove Music') },
		{ label: 'Single', onRemove: action('Remove Single') },
	],
};
