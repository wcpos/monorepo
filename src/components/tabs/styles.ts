import styled from 'styled-components/native';
import { Text } from '../text/styles';
import Pressable from '../pressable';

export const Container = styled.View``;

export const TabsContainer = styled.View`
	flex-direction: row;
	align-items: stretch;
`;

export const Tab = styled(Pressable)<{ selected: boolean }>`
	align-items: center;
	justify-content: center;
	padding: 5px;
`;

export const Label = styled(Text)<{ selected: boolean }>`
	color: ${({ selected, theme }) => (selected ? theme.TEXT_COLOR : theme.TEXT_COLOR_SECONDARY)};
`;
