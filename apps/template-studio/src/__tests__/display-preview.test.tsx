import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DisplayStage } from '../components/DisplayStage';
import { TemplateList } from '../components/TemplateList';
import {
	ACTIVE_DISPLAY_TEMPLATE,
	displayPreviewUrl,
	fetchDisplayTemplates,
	resolveDisplayOrigin,
} from '../studio-api';

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe('customer display previews', () => {
	it('formats the WordPress display preview URL', () => {
		expect(displayPreviewUrl('https://store.example/', 'plugin-pro', 'payment.approved')).toBe(
			'https://store.example/wcpos-display/?preview=payment.approved&template=plugin-pro'
		);
	});

	it('maps display templates from the WordPress REST route', async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify([
						{ id: 42, title: 'Counter', is_virtual: false, engine: 'display' },
						{ id: 'plugin-pro', title: 'Pro', is_virtual: true, engine: 'display' },
					]),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
		);

		await expect(fetchDisplayTemplates()).resolves.toEqual([
			{ id: 42, title: 'Counter' },
			{ id: 'plugin-pro', title: 'Pro' },
		]);
		expect(globalThis.fetch).toHaveBeenCalledWith(
			'/wp-json/wcpos/v2/templates?type=display',
			expect.objectContaining({ credentials: 'include' })
		);
	});

	it('returns an empty list when the display route is unavailable', async () => {
		globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 }));

		await expect(fetchDisplayTemplates()).resolves.toEqual([]);
	});

	it('renders the selected display and switches preview state', () => {
		render(<DisplayStage siteOrigin="https://store.example" templateId="plugin-pro" />);

		const frame = screen.getByTitle('Customer display preview');
		expect(frame).toHaveAttribute(
			'src',
			'https://store.example/wcpos-display/?preview=cart&template=plugin-pro'
		);

		fireEvent.click(screen.getByRole('button', { name: 'Payment approved' }));
		expect(frame).toHaveAttribute(
			'src',
			'https://store.example/wcpos-display/?preview=payment.approved&template=plugin-pro'
		);
	});

	it('shows the Display group only when display templates were fetched', () => {
		const props = {
			templates: [],
			selectedTemplateId: '',
			onSelect: vi.fn(),
		};
		const { rerender } = render(<TemplateList {...props} displayTemplates={[]} />);
		expect(screen.queryByRole('heading', { name: 'Display' })).not.toBeInTheDocument();

		rerender(<TemplateList {...props} displayTemplates={[{ id: 42, title: 'Counter display' }]} />);
		expect(screen.getByRole('heading', { name: 'Display' })).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Counter display' }));
		expect(props.onSelect).toHaveBeenCalledWith('display:42');
	});
});

describe('display preview review follow-ups', () => {
	it('omits template= for the active display template', () => {
		expect(displayPreviewUrl('https://store.example', ACTIVE_DISPLAY_TEMPLATE.id, 'idle')).toBe(
			'https://store.example/wcpos-display/?preview=idle'
		);
	});

	it('swaps a loopback WP hostname for the browser hostname', () => {
		expect(resolveDisplayOrigin('http://localhost:8888', '192.168.1.20')).toBe(
			'http://192.168.1.20:8888'
		);
		expect(resolveDisplayOrigin('http://localhost:8888', 'localhost')).toBe(
			'http://localhost:8888'
		);
		expect(resolveDisplayOrigin('https://store.example', '192.168.1.20')).toBe(
			'https://store.example'
		);
	});
});
