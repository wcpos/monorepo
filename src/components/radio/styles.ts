import styled, { css } from 'styled-components/native';

// marginVertical: (theme.font.size.regular.height - size) / 2,
export const BackgroundCircle = styled.View`
	background-color: ${({ theme }) => theme.colors.background};
	border-color: ${({ theme }) => theme.colors.primary};
	border-width: ${({ theme }) => theme.border.small};
	border-radius: ${({ theme }) => theme.rounding.circle};
	width: 16;
	height: 16;
	justify-content: center;
	align-items: center;
`;

export const CheckMark = styled.View<{ checked: boolean | undefined }>`
	width: 8;
	height: 8;
	border-radius: ${({ theme }) => theme.rounding.circle};
	background-color: ${({ theme }) => theme.colors.primary};
	opacity: ${({ checked }) => (checked ? 1 : 0)};
`;
