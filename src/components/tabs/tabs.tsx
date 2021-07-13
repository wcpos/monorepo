import React from 'react';
import { Tab } from './tab';
import * as Styled from './styles';

export interface TabsProps {
	/**
	 * List of tabs.
	 */
	tabs: string[];
	/**
	 * Index of selected tab.
	 */
	selected: number;
	/**
	 * Callback when tab is selected.
	 */
	onSelect: (selectedTabIndex: number) => void;
	/**
	 * Content to display in tabs.
	 */
	children: React.ReactNode;
	/**
	 * Content to display in tabs.
	 */
	position?: 'top' | 'bottom';
}

/**
 * Use to alternate among related views sharing the same context.
 */
export const Tabs = ({ tabs, selected, onSelect, children, position = 'top' }: TabsProps) => {
	const tabItems = React.useMemo(
		() =>
			tabs.map((tab, index) => (
				<Tab
					key={tab}
					label={tab}
					selected={selected === index}
					// eslint-disable-next-line react/jsx-no-bind
					onSelect={() => onSelect(index)}
				/>
			)),
		[tabs, selected, onSelect]
	);

	return (
		<Styled.Container>
			{position === 'bottom' && children}
			<Styled.TabsContainer>{tabItems}</Styled.TabsContainer>
			{position === 'top' && children}
		</Styled.Container>
	);
};
