import styled from 'styled-components/native';

export const Container = styled.View`
	background: ${({ theme }) => theme.COLOR_CRITICAL};
	flex-direction: row;
`;

export const IconContainer = styled.View`
	padding: ${({ theme }) => theme.PAGE_MAIN_PADDING_X};
	justify-content: center;
`;

/**
 * flexShrink: 1 is required to make text wrap, not sure why?
 */
export const TextContainer = styled.View`
	flex: 1;
	padding: ${({ theme }) => theme.PAGE_MAIN_PADDING_X};
`;

export const RemoveContainer = styled.View``;
