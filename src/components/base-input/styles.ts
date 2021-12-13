import styled, { css } from 'styled-components/native';
import Platform from '@wcpos/common/src/lib/platform';
import Pressable from '../pressable';
import { Text } from '../text/styles';

export const Box = styled(Pressable)`
	flex-direction: row;
	align-items: center;
	background: ${({ theme }) => theme.SEGMENT_BACKGROUND_COLOR};
	border-width: ${({ theme }) => theme.SEGMENT_BORDER_WIDTH};
	border-color: ${({ theme }) => theme.SEGMENT_BORDER_COLOR};
	border-style: solid;
	border-radius: ${({ theme }) => theme.SEGMENT_BORDER_RADIUS};
	padding: ${({ theme }) => theme.SEGMENT_PADDING};

	${Platform.OS === 'ios' &&
	css`
		height: 30px;
	`}
`;

export const InputText = styled(Text)`
	flex: 1;
`;
