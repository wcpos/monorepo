import * as React from 'react';
import { View } from 'react-native';
import { action } from '@storybook/addon-actions';
import styled from 'styled-components/native';
import { Interactive, InteractiveProps } from './interactive';
import Text from '../text';

// export const InteractiveContainer = styled(Interactive)`
// 	display: 'flex',
// 	flex: 1,
// 	width: '50px',
// 	height: '50px',
// `;

export default {
	title: 'Components/Interactive',
	component: Interactive,
};

export const BasicUsage = (props: InteractiveProps) => <Interactive {...props} />;
BasicUsage.args = {
	onMove: action('Move'),
};
