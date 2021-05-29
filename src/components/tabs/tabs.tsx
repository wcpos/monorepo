import React, { useMemo } from 'react';
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
}

/**
 * Use to alternate among related views sharing the same context.
 */
export const Tabs: React.FC<TabsProps> = ({ tabs, selected, onSelect, children }) => {
	const tabItems = useMemo(
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
			<Styled.TabsContainer>{tabItems}</Styled.TabsContainer>
			{children}
		</Styled.Container>
	);
};
