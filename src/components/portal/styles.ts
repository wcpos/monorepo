import styled from 'styled-components/native';

type ThemeProps = import('../../lib/theme').ThemeProps;

export const StyledManagerView = styled.View<{ theme: ThemeProps }>`
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	height: 100%;
`;

export const StyledHostView = styled.View<{ theme: ThemeProps }>`
	flex: 1;
`;
