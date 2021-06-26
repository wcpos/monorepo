import styled, { css } from 'styled-components/native';
import Pressable from '../pressable';
import { Text } from '../text/styles';

export const Container = styled.View``;

export const Item = styled(Pressable)`
	padding: 5px 10px;
`;

export const Label = styled(Text)<{ hovered: boolean }>`
	${({ hovered, theme, type }) =>
		hovered &&
		// @ts-ignore
		(type === 'critical') | (type === 'warning') &&
		`
    color: ${theme.TEXT_COLOR_INVERSE};
  `}
`;
