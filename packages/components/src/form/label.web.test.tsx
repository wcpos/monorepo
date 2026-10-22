import * as React from 'react';
import { TextInput } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';

import { FormItem, FormLabel } from './common';
import { FormFieldContext } from './context';
import { FormInput } from './input';
import { FormSwitch } from './switch';

/**
 * Tab in a web form must go field to field. A label rendered as a react-native-web
 * Pressable is a `tabindex="0"` div, so every label was a Tab stop between fields.
 * These run the real `FormLabel` → web `Label` → react-native-web DOM, so what is
 * asserted is the element the browser gets.
 *
 * Jest has no platform extensions, so the web label is mapped in the way Metro
 * resolves `../label` on web.
 */
jest.mock('../label', () => jest.requireActual('../label/index.web'));

// The primitive ships classic-runtime JSX this preset cannot run; its Text is RN's Text,
// which react-native-web renders with `nativeID` as the DOM `id`.
jest.mock('@rn-primitives/label', () => ({ Text: jest.requireActual('react-native').Text }));

// `./common`'s FormMessage animates in; only its presence matters here, not the motion.
jest.mock('react-native-reanimated', () => {
	const { Text } = jest.requireActual('react-native');
	const motion = { duration: () => motion };
	return {
		__esModule: true,
		default: { Text },
		Easing: { bezier: () => () => 0 },
		FadeInDown: motion,
		FadeOut: motion,
	};
});

// The input is injected through `customComponent` (RNW's TextInput: a real <input>).
jest.mock('../input', () => ({ Input: () => null }));

jest.mock('../switch', () => ({
	Switch: ({ checked, onCheckedChange, ...props }: Record<string, any>) => (
		<input
			type="checkbox"
			role="switch"
			aria-labelledby={props['aria-labelledby']}
			checked={checked}
			onChange={() => onCheckedChange(!checked)}
		/>
	),
}));

function Harness({ children }: { children: React.ReactNode }) {
	const form = useForm({ defaultValues: { field: '' } });
	return (
		<FormProvider {...form}>
			<FormFieldContext.Provider value={{ name: 'field' }}>{children}</FormFieldContext.Provider>
		</FormProvider>
	);
}

/** The label's own root: the element wrapping the id-bearing text node. */
function labelRoot(text: string) {
	const root = screen.getByText(text).closest('[id]')?.parentElement;
	expect(root).toBeTruthy();
	return root as HTMLElement;
}

describe('web form labels', () => {
	it('is a real <label>, never a Tab stop, and names its input', () => {
		render(
			<Harness>
				<FormInput
					name="field"
					label="Store name"
					value=""
					onChange={jest.fn()}
					onBlur={jest.fn()}
					customComponent={TextInput}
				/>
			</Harness>
		);

		const label = labelRoot('Store name');
		const input = screen.getByRole('textbox');

		for (const node of [label, ...label.querySelectorAll('*')]) {
			expect(node).not.toHaveAttribute('tabindex', '0');
			expect(node).not.toHaveAttribute('role', 'button');
		}
		expect(label.tagName).toBe('LABEL');
		expect(label.tabIndex).toBe(-1);

		const labelId = screen.getByText('Store name').closest('[id]')?.id;
		expect(labelId).toBeTruthy();
		expect(label.contains(document.getElementById(labelId!))).toBe(true);
		expect(input).toHaveAttribute('aria-labelledby', labelId);

		fireEvent.click(screen.getByText('Store name'));
		expect(input).toHaveFocus();
	});

	it('toggles a switch when its label is clicked', () => {
		const onChange = jest.fn();
		render(
			<Harness>
				<FormSwitch
					name="field"
					label="Show out of stock"
					value={false}
					onChange={onChange}
					onBlur={jest.fn()}
				/>
			</Harness>
		);

		const label = labelRoot('Show out of stock');
		expect(label).not.toHaveAttribute('tabindex', '0');
		expect(label.tagName).toBe('LABEL');
		expect(screen.getByRole('switch')).toHaveAttribute(
			'aria-labelledby',
			screen.getByText('Show out of stock').closest('[id]')?.id
		);

		fireEvent.click(screen.getByText('Show out of stock'));
		expect(onChange).toHaveBeenCalledWith(true);
	});

	/**
	 * A `SettingsRow` is a `FormItem` + `FormLabel` with the wrapper beside it and no label
	 * of its own: the wrapper adopts the row's item, so the row's label names and acts.
	 */
	describe('inside an enclosing item whose label names the control', () => {
		it('names the input by the enclosing label, and a click focuses it', () => {
			render(
				<Harness>
					<FormItem>
						<FormLabel>Store name</FormLabel>
						<FormInput
							name="field"
							value=""
							onChange={jest.fn()}
							onBlur={jest.fn()}
							customComponent={TextInput}
						/>
					</FormItem>
				</Harness>
			);

			const labelId = screen.getByText('Store name').closest('[id]')?.id;
			expect(labelId).toMatch(/-form-item$/);
			const input = screen.getByRole('textbox');
			expect(input).toHaveAttribute('aria-labelledby', labelId);
			expect(document.querySelectorAll(`[id="${labelId}"]`)).toHaveLength(1);

			fireEvent.click(screen.getByText('Store name'));
			expect(input).toHaveFocus();
		});

		it('names the switch by the enclosing label, and a click toggles it', () => {
			const onChange = jest.fn();
			render(
				<Harness>
					<FormItem>
						<FormLabel>Show out of stock</FormLabel>
						<FormSwitch name="field" value={false} onChange={onChange} onBlur={jest.fn()} />
					</FormItem>
				</Harness>
			);

			expect(screen.getByRole('switch')).toHaveAttribute(
				'aria-labelledby',
				screen.getByText('Show out of stock').closest('[id]')?.id
			);

			fireEvent.click(screen.getByText('Show out of stock'));
			expect(onChange).toHaveBeenCalledWith(true);
		});

		it('keeps a wrapper that has its own label on its own label', () => {
			render(
				<Harness>
					<FormItem>
						<FormLabel>Row</FormLabel>
						<FormInput
							name="field"
							label="Own"
							value=""
							onChange={jest.fn()}
							onBlur={jest.fn()}
							customComponent={TextInput}
						/>
					</FormItem>
				</Harness>
			);

			const rowId = screen.getByText('Row').closest('[id]')?.id;
			const ownId = screen.getByText('Own').closest('[id]')?.id;
			expect(ownId).not.toBe(rowId);
			const input = screen.getByRole('textbox');
			expect(input).toHaveAttribute('aria-labelledby', ownId);

			fireEvent.click(screen.getByText('Row'));
			expect(input).not.toHaveFocus();
			fireEvent.click(screen.getByText('Own'));
			expect(input).toHaveFocus();
		});
	});
});
