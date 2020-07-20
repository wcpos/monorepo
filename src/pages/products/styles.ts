import styled, { css } from 'styled-components/native';

type ThemeProps = import('../../lib/theme/types').ThemeProps;

// eslint-disable-next-line import/prefer-default-export
export const Container = styled.View<{ theme: ThemeProps }>`
	height: 100%;
	flex-direction: row;
	flex: 1;
`;
