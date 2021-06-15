import styled from 'styled-components/native';
import { Text } from '../text/text';
import { Skeleton } from '../skeleton/skeleton';

export const Tag = styled.View<{ disabled?: boolean }>`
	flex-direction: row;
	align-items: center;
	padding: ${({ theme }) => `${theme.TAG_PADDING_Y} ${theme.TAG_PADDING_X}`};
	border-radius: ${({ theme }) => theme.TAG_BORDER_RADIUS}
	background-color: ${({ theme, disabled }) =>
		disabled ? theme.TAG_BACKGROUND_DISABLED : theme.TAG_BACKGROUND_COLOR};
`;

export const Label = styled(Text)`
	color: ${({ theme }) => theme.TAG_TEXT_COLOR};
`;

export const Group = styled.View`
	flex-direction: row;
	flex-flow: wrap;
	gap: 2px 2px;
	margin-bottom: 2px;
`;

export const TagSkeleton = styled(Skeleton)`
	border-radius: ${({ theme }) => theme.TAG_BORDER_RADIUS};
`;
