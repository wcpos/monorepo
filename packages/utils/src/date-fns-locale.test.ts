/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { format } from 'date-fns/format';

import {
	DATE_FNS_LOCALE_LOADERS,
	enUS,
	loadDateFnsLocale,
	useDateFnsLocale,
} from './date-fns-locale';

it('uses English for unknown codes, including inherited object keys', async () => {
	for (const code of ['unknown', '__proto__', 'constructor', 'en']) {
		expect(await loadDateFnsLocale(code)).toBe(enUS);
	}
});

it('loads Spanish formatting once and reuses the resolved locale', async () => {
	const loader = jest.spyOn(DATE_FNS_LOCALE_LOADERS, 'es');
	const locale = await loadDateFnsLocale('es');
	expect(format(new Date(2024, 0, 1), 'MMMM', { locale })).toBe('enero');
	expect(await loadDateFnsLocale('es')).toBe(locale);
	expect(loader).toHaveBeenCalledTimes(1);
	loader.mockRestore();
});

it('renders English while loading, then updates and reuses cached locales', async () => {
	const { result, rerender } = renderHook(({ code }) => useDateFnsLocale(code), {
		initialProps: { code: 'fr' },
	});
	expect(result.current).toBe(enUS);
	await waitFor(() => expect(result.current.code).toBe('fr'));
	rerender({ code: 'es' });
	expect(result.current.code).toBe('es');
	rerender({ code: 'unknown' });
	expect(result.current).toBe(enUS);
});

it('resolves every explicit locale subpath', async () => {
	for (const load of Object.values(DATE_FNS_LOCALE_LOADERS)) {
		expect((await load()).localize.month(0)).toEqual(expect.any(String));
	}
});
