import { readFileSync } from 'node:fs';

import * as React from 'react';

import { fireEvent, render } from '@testing-library/react';

import { Avatar, getInitials, isGravatarUrl, withoutDefaultGravatar } from './index';

jest.mock('react-native', () => ({
	View: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
	Text: ({
		maxFontSizeMultiplier: _,
		...props
	}: React.HTMLAttributes<HTMLSpanElement> & { maxFontSizeMultiplier?: number }) => (
		<span {...props} />
	),
}));
jest.mock('@rn-primitives/slot', () => ({ Slot: () => null }));
jest.mock('../image', () => ({
	Image: ({
		onError,
		onLoad,
		source,
	}: {
		onError: () => void;
		onLoad: () => void;
		source?: { uri?: string } | string;
	}) => (
		<img
			alt="Avatar"
			src={typeof source === 'string' ? source : source?.uri}
			onError={onError}
			onLoad={onLoad}
		/>
	),
}));
jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => <i data-icon={name} />,
}));

it("puts a person's initials on the primary accent at the xs ramp size", () => {
	const { container } = render(<Avatar fallback="PK" size="xs" />);
	expect(container.firstChild).toHaveClass('size-5', 'bg-primary');
	expect(container.querySelector('span')).toHaveClass('text-2xs', 'text-primary-foreground');
	expect(container.textContent).toBe('PK');
});

it('keeps a muted surface for a non-person and draws an icon instead of initials', () => {
	const { container } = render(<Avatar icon="user" variant="muted" fallback="GU" />);
	expect(container.firstChild).toHaveClass('bg-muted');
	expect(container.querySelector('[data-icon="user"]')).not.toBeNull();
	expect(container.textContent).toBe('');
});

it('asks Gravatar for a 404 instead of the default silhouette', () => {
	expect(withoutDefaultGravatar('https://secure.gravatar.com/avatar/abc?s=96&d=mm&r=g')).toBe(
		'https://secure.gravatar.com/avatar/abc?s=96&r=g&d=404'
	);
	expect(withoutDefaultGravatar('//www.gravatar.com/avatar/abc?default=mp')).toBe(
		'//www.gravatar.com/avatar/abc?d=404'
	);
	expect(withoutDefaultGravatar('https://0.gravatar.com/avatar/abc')).toBe(
		'https://0.gravatar.com/avatar/abc?d=404'
	);
});

it('leaves a non-Gravatar picture untouched', () => {
	const upload = 'https://shop.example/wp-content/uploads/me.jpg?d=mm';
	expect(isGravatarUrl(upload)).toBe(false);
	expect(withoutDefaultGravatar(upload)).toBe(upload);
	expect(isGravatarUrl('https://gravatar.com.evil.example/avatar/abc')).toBe(false);
});

it('loads the rewritten Gravatar URL and shows initials when it fails', () => {
	const { container } = render(
		<Avatar source={{ uri: 'https://www.gravatar.com/avatar/abc?d=mm' }} fallback="AL" />
	);
	const img = container.querySelector('img')!;
	expect(img.getAttribute('src')).toBe('https://www.gravatar.com/avatar/abc?d=404');
	fireEvent.error(img);
	expect(container.textContent).toBe('AL');
});

it('treats an empty uri as no picture', () => {
	const { container } = render(<Avatar source={{ uri: undefined }} fallback="AL" />);
	expect(container.querySelector('img')).toBeNull();
	expect(container.textContent).toBe('AL');
});

it('falls back on image error and resets only when source content changes', () => {
	const { container, rerender } = render(<Avatar source={{ uri: 'first' }} fallback="PK" />);
	fireEvent.error(container.querySelector('img')!);
	expect(container.querySelector('img')).toBeNull();
	expect(container.textContent).toBe('PK');
	rerender(<Avatar source={{ uri: 'first' }} fallback="PK" />);
	expect(container.querySelector('img')).toBeNull();
	rerender(<Avatar source={{ uri: 'second' }} fallback="PK" />);
	expect(container.querySelector('img')).not.toBeNull();
});

it('preserves the question mark for an empty name', () => {
	expect(getInitials('  ')).toBe('?');
});

it('contains no arbitrary text sizes or palette greys', () => {
	const source = readFileSync(`${__dirname}/index.tsx`, 'utf8');
	expect(source).not.toContain('text-[');
	expect(source).not.toContain('gray');
});

it('keeps the initials under the picture until it has loaded', () => {
	const { container } = render(
		<Avatar source={{ uri: 'https://shop.example/me.jpg' }} fallback="AL" />
	);
	expect(container.querySelector('img')).not.toBeNull();
	expect(container.textContent).toBe('AL');
	fireEvent.load(container.querySelector('img')!);
	expect(container.textContent).toBe('');
});
