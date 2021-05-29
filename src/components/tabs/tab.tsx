import React from 'react';
import * as Styled from './styles';

export interface TabProps {
	label: string;
	selected: boolean;
	onSelect: () => void;
}

export const Tab: React.FC<TabProps> = ({ label, selected, onSelect }) => {
	return (
		<Styled.Tab selected={selected} onPress={onSelect}>
			<Styled.Label selected={selected}>{label}</Styled.Label>
		</Styled.Tab>
	);
};
