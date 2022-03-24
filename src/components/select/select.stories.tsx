import * as React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoryWrapper } from '@storybook/addons';
import { AppProviderSizeProvider } from '@wcpos/common/src/hooks/use-position-in-app';
import { Select, SelectProps } from './select';
import Portal from '../portal';

/**
 * Select require (uses Popover)
 * - SafeAreaProvider
 * - Portals
 * - AppProviderSizeProvider
 */
const AppProvider: StoryWrapper = (Story, context) => {
	return (
		<SafeAreaProvider>
			<AppProviderSizeProvider>
				<Portal.Provider>
					<View style={{ height: '600px' }}>
						<Story {...context} />
					</View>
					<Portal.Manager />
				</Portal.Provider>
			</AppProviderSizeProvider>
		</SafeAreaProvider>
	);
};

export default {
	title: 'Components/Select',
	component: Select,
	decorators: [AppProvider],
};

export const BasicUsage = (props: SelectProps) => {
	const [selected, setSelected] = React.useState(props.selected);

	return <Select {...props} selected={selected} onChange={setSelected} />;
};
BasicUsage.args = {
	label: 'Select your favorite color',
	selected: null,
	placeholder: 'Should be a color',
	helpText: 'Colors are displayed in neutral color, in case you are color blind.',
	options: [
		{ label: 'Blue', value: 'blue' },
		{ label: 'Red', value: 'red' },
		{ label: 'Green', value: 'green' },
		{ label: 'Yellow', value: 'yellow' },
	],
};

export const WithManyOptions: React.FC = () => {
	const [selected, setSelected] = React.useState<string | null>(null);
	const options: number[] = [];

	for (let i = 0; i < 100; i++) {
		options.push(i);
	}

	return (
		<Select
			label="Choose a number"
			placeholder="choose"
			selected={selected}
			options={options.map((x) => ({
				label: x.toString(),
				value: x.toString(),
				disabled: x < 10,
			}))}
			onChange={setSelected}
			helpText="Numbers which are below 10 are disabled."
		/>
	);
};

export const Disabled: React.FC = () => {
	const [selected, setSelected] = React.useState<string | null>(null);

	return (
		<Select
			label="Choose a color"
			selected={selected}
			options={[
				{ label: 'Blue', value: 'blue' },
				{ label: 'Red', value: 'red' },
				{ label: 'Green', value: 'green' },
				{ label: 'Yellow', value: 'yellow' },
			]}
			onChange={setSelected}
			disabled
		/>
	);
};

export const WithError: React.FC = () => {
	const [selected, setSelected] = React.useState<string | null>(null);

	return (
		<Select
			label="Choose a color"
			selected={selected}
			options={[
				{ label: 'Blue', value: 'blue' },
				{ label: 'Red', value: 'red' },
				{ label: 'Green', value: 'green' },
				{ label: 'Yellow', value: 'yellow' },
			]}
			onChange={setSelected}
			error="Please choose a more beautiful color"
		/>
	);
};
