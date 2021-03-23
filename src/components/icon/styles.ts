import { StyleSheet, Platform, ViewStyle } from 'react-native';
import styled, { css } from 'styled-components/native';

// eslint-disable-next-line import/prefer-default-export
export const Icon = styled.View`
	flex: 0 1 auto;
	align-items: center;
	justify-content: center;
	border-style: solid;
	background-color: ${({ theme, checked }) =>
		checked ? theme.CHECKBOX_BACKGROUND_COLOR : 'transparent'};
	width: ${({ theme }) => theme.CHECKBOX_WIDTH};
	height: ${({ theme }) => theme.CHECKBOX_HEIGHT};
	border-width: ${({ theme }) => theme.CHECKBOX_BORDER_WIDTH};
	border-color: ${({ theme }) => theme.CHECKBOX_BORDER_COLOR};
	border-radius: ${({ theme }) => theme.CHECKBOX_BORDER_RADIUS};
`;

// interface Props {
// 	button: ViewStyle;
// 	raised: ViewStyle;
// 	disabled: ViewStyle;
// }

// const styles: Props = StyleSheet.create({
// 	button: {
// 		margin: 7,
// 	},
// 	raised: {
// 		...Platform.select({
// 			android: {
// 				elevation: 2,
// 			},
// 			default: {
// 				shadowColor: 'rgba(0,0,0, .4)',
// 				shadowOffset: { height: 1, width: 1 },
// 				shadowOpacity: 1,
// 				shadowRadius: 1,
// 			},
// 		}),
// 	},
// 	disabled: {
// 		backgroundColor: '#D1D5D8',
// 	},
// });

// export default styles;
