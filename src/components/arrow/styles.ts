import styled from 'styled-components/native';

type Props = { theme: import('../../lib/theme').ThemeProps } & import('./arrow').Props;

export const ArrowView = styled.View<Props>`
	width: 20px;
	border-left-width: 10px;
	border-right-width: 10px;
	border-bottom-width: 10px;
	border-bottom-color: white;
	border-left-color: transparent;
	border-right-color: transparent;
	background-color: transparent;
	box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.2);
`;
