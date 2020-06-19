import React from 'react';
import { action } from '@storybook/addon-actions';
import { text } from '@storybook/addon-knobs';
import Tag from '.';

export default {
	title: 'Components/Tag',
};

export const basicUsage = () => <Tag>{text('children', 'Label')}</Tag>;
