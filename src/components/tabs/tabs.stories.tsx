import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { Tabs, TabsProps } from './tabs';
import { Tab } from './tab';
import Text from '../text';

export default {
	title: 'Components/Tabs',
	component: Tabs,
	subcomponents: [Tab],
};

export const BasicUsage = (props: TabsProps) => {
	const [selected, setSelected] = React.useState(props.selected ?? 0);

	const tabContent = selected === 0 ? <Text>Foo</Text> : <Text>Bar</Text>;

	return (
		<Tabs {...props} selected={selected} onSelect={setSelected}>
			{tabContent}
		</Tabs>
	);
};
BasicUsage.args = {
	tabs: ['Developers', 'Designers'],
	selected: 0,
};
BasicUsage.argTypes = {
	children: { control: null },
};
