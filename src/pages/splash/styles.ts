import styled from 'styled-components/native';

type ThemeProps = import('../../lib/theme').ThemeProps;

// eslint-disable-next-line import/prefer-default-export
export const Splash = styled.View<{ theme: ThemeProps }>`
	width: 100%;
	align-items: center;
	justify-content: center;
`;
