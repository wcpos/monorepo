import styled, { css } from 'styled-components/native';

type ThemeProps = import('../../lib/theme/types').ThemeProps;

export const Container = styled.View<{ theme: ThemeProps }>`
	height: 100%;
	flex-direction: row;
`;

export const Column = styled.View<{ theme: ThemeProps }>`
	height: 100%;
	flex: 1;
`;
