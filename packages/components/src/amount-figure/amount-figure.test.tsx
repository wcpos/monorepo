import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { AmountFigure } from './index';
import { ThemeTraitsContext } from '../lib/theme-traits';

jest.mock('@wcpos/utils/platform', () => ({ Platform: { isWeb: false } }));

// Expose classes because Jest does not compile Uniwind.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	const host = (tag: string, props: Record<string, any>) =>
		React.createElement(
			tag,
			{
				'data-testid': props.testID,
				'data-classes': props.className,
				style: actual.StyleSheet.flatten(props.style),
			},
			props.children
		);
	return {
		...actual,
		View: (props: Record<string, any>) => host('div', props),
		Text: (props: Record<string, any>) => host('span', props),
	};
});

const words = (id: string) =>
	((screen.getByTestId(id) as HTMLElement).dataset.classes ?? '').split(/\s+/);

// size, tone → the classes the figure carries.
const scale: [string, string, string[]][] = [
	['hero', 'default', ['text-amt', 'text-foreground']],
	['headline', 'default', ['text-2xl', 'text-foreground']],
	['tile', 'default', ['text-xl', 'text-foreground']],
	['tile', 'bad', ['text-xl', 'text-bad']],
	['hero', 'ok', ['text-amt', 'text-ok']],
];

describe('AmountFigure', () => {
	it('uses the italic display family, leaving its eyebrow in the body family', () => {
		render(
			<ThemeTraitsContext.Provider
				value={{ type: { body: 'DM Sans', display: 'Instrument Serif', displayItalic: true } }}
			>
				<AmountFigure testID="figure" eyebrow="Total">
					$10.00
				</AmountFigure>
				<AmountFigure testID="override" style={{ fontFamily: 'X' }}>
					$20.00
				</AmountFigure>
			</ThemeTraitsContext.Provider>
		);
		expect(screen.getByTestId('figure')).toHaveStyle({ fontFamily: 'Instrument Serif' });
		expect(words('figure')).toEqual(
			expect.arrayContaining(['italic', 'font-bold', 'tabular-nums'])
		);
		expect(screen.getByText('Total')).toHaveStyle({ fontFamily: 'DM Sans' });
		expect(screen.getByTestId('override')).toHaveStyle({ fontFamily: 'X' });
	});

	it.each(scale)('%s %s is bold, tabular and one size step', (size, tone, present) => {
		render(
			<AmountFigure testID="figure" size={size as never} tone={tone as never}>
				$10.00
			</AmountFigure>
		);
		const list = words('figure');
		expect(list).toEqual(expect.arrayContaining([...present, 'font-bold', 'tabular-nums']));
		expect(list.filter((name) => /^text-(xl|2xl|amt|4xl|7xl)$/.test(name))).toHaveLength(1);
	});

	it('defaults to the hero and centres it with its eyebrow on a centred stage', () => {
		const { container } = render(
			<AmountFigure testID="figure" eyebrow="On the terminal" center>
				$10.00
			</AmountFigure>
		);
		expect(words('figure')).toEqual(expect.arrayContaining(['text-amt', 'text-center']));
		expect((container.firstElementChild as HTMLElement).dataset.classes).toContain('items-center');
	});

	it('sets the eyebrow in the caption rank above the figure', () => {
		const { container } = render(<AmountFigure eyebrow="Remaining">$4.00</AmountFigure>);
		const [eyebrow, figure] = Array.from(container.querySelectorAll('span'));
		expect(eyebrow.textContent).toBe('Remaining');
		expect(eyebrow.dataset.classes).toContain('uppercase');
		expect(figure.textContent).toBe('$4.00');
	});
});
