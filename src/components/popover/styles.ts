import styled from 'styled-components/native';

export const Container = styled.View`
	position: absolute;
	top: 0;
	left: 0;
	align-items: flex-start;
	z-index: ${({ theme }) => theme.POPOVER_Z_INDEX};
`;

export const Popover = styled.View`
	background-color: ${({ theme }) => theme.POPOVER_BACKGROUND_COLOR};
	shadow-offset: { width: 0, height: 1 };
	shadow-opacity: 0.22;
	shadow-radius: 7.5;
	shadow-color: #000;
	elevation: 8;
	padding: 5px;
	border-radius: 3px;
`;
