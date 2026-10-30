/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';

import { META_DATA_DEFAULT_ROW, MetaDataForm } from './meta-data-form';

function mockInput({
	value,
	onChange,
	testID,
}: {
	value?: string;
	onChange?: (value: string) => void;
	testID?: string;
}) {
	return (
		<input data-testid={testID} value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} />
	);
}
function mockWrap({ children }: React.PropsWithChildren) {
	return <>{children}</>;
}
// The Saved mark renders, in the verb's place, on the row naming the saved field: `name` is observable.
let mockSaved = '';
jest.mock('@wcpos/components/form', () => ({
	SavedMark: ({ name }: { name: string }) => <span data-testid={`saved-${name}`} />,
	useSavedName: () => mockSaved,
	FormField: jest.requireActual('react-hook-form').Controller,
	FormInput: mockInput,
	FormItem: mockWrap,
}));
jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../jest/property-row.test-utils')
);
jest.mock('@wcpos/components/hstack', () => ({ HStack: mockWrap }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: mockWrap }));
jest.mock('@wcpos/components/text', () => ({ Text: mockWrap }));
jest.mock('../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../jest/translate').createTestT(),
}));

type Meta = { id?: number; key: string; value: unknown; attr_id?: number; display_key?: string };
// The callers' add button appends the way this one does: the whole array, through setValue.
function Harness({ meta, hiddenKeys }: { meta: Meta[]; hiddenKeys?: string[] }) {
	const form = useForm({ defaultValues: { meta_data: meta } });
	const add = () =>
		form.setValue('meta_data', [...form.getValues('meta_data'), { ...META_DATA_DEFAULT_ROW }]);
	return (
		<FormProvider {...form}>
			<MetaDataForm testID="m" hiddenKeys={hiddenKeys} />
			<button data-testid="add" onClick={add} />
		</FormProvider>
	);
}

beforeEach(() => {
	mockSaved = '';
});

const has = (id: string) => screen.queryByTestId(id) !== null;
const toggle = () => screen.getByTestId('m-hidden-fields-toggle');
const saleCounter = { id: 1, key: '_wcpos_sale_counter', value: '6' };
const gift = { id: 2, key: 'gift', value: 'yes' };

it('folds a private field behind one Hidden fields row; public rows stay', () => {
	render(<Harness meta={[saleCounter, gift]} />);
	expect(has('m-row-meta-1')).toBe(true);
	expect(has('m-remove-meta-1')).toBe(true);
	expect(has('m-row-meta-0')).toBe(false);
	expect(screen.getByTestId('m-hidden-fields').textContent).toContain('Hidden fields');
	expect(screen.getByTestId('m-hidden-fields').textContent).toContain('1 field');
	expect(toggle().textContent).toBe('Show');
});

it('Show opens the private rows indented and editable; Hide puts them away', () => {
	render(<Harness meta={[saleCounter, gift]} />);
	fireEvent.click(toggle());
	const row = screen.getByTestId('m-row-meta-0');
	expect(row.getAttribute('data-indent')).toBe('true');
	expect(screen.getByDisplayValue('_wcpos_sale_counter')).toBeTruthy();
	expect(screen.getByDisplayValue('6')).toBeTruthy();
	expect(has('m-remove-meta-0')).toBe(true);
	expect(toggle().textContent).toBe('Hide');
	fireEvent.click(toggle());
	expect(has('m-row-meta-0')).toBe(false);
	expect(toggle().textContent).toBe('Show');
});

it('draws no Hidden fields row when nothing is private', () => {
	mockSaved = 'meta_data';
	render(<Harness meta={[gift]} />);
	expect(has('m-hidden-fields')).toBe(false);
	expect(screen.getByTestId('m-row-meta-0').contains(screen.getByTestId('saved-meta_data'))).toBe(
		true
	);
});

it('the Saved mark sits on Hidden fields while closed with no public row, then on the first private row', () => {
	const meta = [saleCounter, { id: 3, key: '_other', value: 'x' }];
	const { rerender } = render(<Harness meta={meta} />);
	mockSaved = 'meta_data';
	rerender(<Harness meta={meta} />);
	expect(screen.getByTestId('m-hidden-fields').textContent).toContain('2 fields');
	const mark = () => screen.getByTestId('saved-meta_data');
	expect(screen.getByTestId('m-hidden-fields').contains(mark())).toBe(true);
	mockSaved = '';
	rerender(<Harness meta={meta} />);
	fireEvent.click(toggle());
	mockSaved = 'meta_data';
	rerender(<Harness meta={meta} />);
	expect(screen.getByTestId('m-row-meta-0').contains(mark())).toBe(true);
	expect(screen.getByTestId('m-hidden-fields').contains(mark())).toBe(false);
	expect(screen.getAllByTestId('saved-meta_data')).toHaveLength(1);
});

it('a hiddenKeys row is neither drawn nor counted', () => {
	render(
		<Harness
			meta={[saleCounter, { id: 3, key: '_pos_user', value: '7' }]}
			hiddenKeys={['_pos_user']}
		/>
	);
	expect(screen.getByTestId('m-hidden-fields').textContent).toContain('1 field');
	fireEvent.click(toggle());
	expect(has('m-row-meta-0')).toBe(true);
	expect(has('m-row-meta-1')).toBe(false);
});

it('an attribute row stays locked in the list and is not counted, even keyed with _', () => {
	const attr = { id: 4, key: '_pa_size', value: 'l', attr_id: 2, display_key: 'Size' };
	render(<Harness meta={[attr, saleCounter]} />);
	expect(screen.getByTestId('m-row-meta-0').textContent).toContain('Size');
	expect(has('m-remove-meta-0')).toBe(false);
	expect(screen.getByTestId('m-hidden-fields').textContent).toContain('1 field');
});

it('a new row stays in the list while a private key is typed into it', () => {
	render(<Harness meta={[gift]} />);
	fireEvent.click(screen.getByTestId('add'));
	const key = screen.getByTestId('m-row-meta-1').querySelector('input')!;
	fireEvent.change(key, { target: { value: '_new' } });
	expect(screen.getByDisplayValue('_new')).toBeTruthy();
	expect(has('m-row-meta-1')).toBe(true);
	expect(has('m-hidden-fields')).toBe(false);
});
