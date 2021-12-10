import styled from 'styled-components/native';
import Pressable, { PressableProps } from '../pressable';

export const Container = styled.View``;

export const PressableTabItem = styled(Pressable)<PressableProps & { focused: boolean }>`
	padding: 10px;
	background-color: ${({ theme, focused }) => (focused ? theme.COLOR_PRIMARY : 'transparent')};
`;
