import { readFileSync } from 'node:fs';

import * as React from 'react';

import { render } from '@testing-library/react';

import { TextClassContext } from '../text';
import { TabsList, TabsTrigger } from './index';

jest.mock('@rn-primitives/tabs', () => ({
	Root: 'div',
	List: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
	Trigger: ({
		onPress,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		onPress?: React.MouseEventHandler<HTMLButtonElement>;
	}) => <button onClick={onPress} {...props} />,
	useRootContext: () => ({ value: 'form' }),
}));
jest.mock('expo-haptics', () => ({
	ImpactFeedbackStyle: { Light: 'light' },
	impactAsync: jest.fn(),
}));
jest.mock('uniwind', () => ({ withUniwind: (component: unknown) => component }));
jest.mock('../select', () => ({ OptionSelect: () => null }));
jest.mock('../icon-button', () => ({ IconButton: () => null }));
jest.mock('../text', () => ({ TextClassContext: React.createContext('') }));

function Label() {
	return <span className={React.useContext(TextClassContext)}>Label</span>;
}

it('paints the active underline and label without a pill surface', () => {
	const { container, getAllByRole } = render(
		<TabsList>
			<TabsTrigger value="form">
				<Label />
			</TabsTrigger>
			<TabsTrigger value="preview" disabled>
				<Label />
			</TabsTrigger>
		</TabsList>
	);
	const [active, disabled] = getAllByRole('button');
	expect(active).toHaveClass('h-ctl', 'border-b-2', 'border-primary');
	expect(active.firstElementChild).toHaveClass('text-foreground', 'font-semibold');
	expect(disabled).toHaveClass('h-ctl', 'border-b-2', 'border-transparent', 'opacity-45');
	expect(container.firstElementChild).toHaveClass('border-b');
	expect(container.firstElementChild).not.toHaveClass('bg-muted');
});

it('retires pill and local focus paint', () => {
	expect(readFileSync(`${__dirname}/index.tsx`, 'utf8')).not.toMatch(
		/focus-visible|whitespace-nowrap|shadow|bg-primary/
	);
});
