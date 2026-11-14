import * as React from 'react';

import { enUS } from 'date-fns/locale/en-US';

import type { Locale } from 'date-fns';
export { enUS };
export const DATE_FNS_LOCALE_LOADERS: Record<string, () => Promise<Locale>> = {
	en: async () => enUS,
	af: () => import('date-fns/locale/af').then((m) => m.af),
	ar: () => import('date-fns/locale/ar').then((m) => m.ar),
	az: () => import('date-fns/locale/az').then((m) => m.az),
	be: () => import('date-fns/locale/be').then((m) => m.be),
	bg: () => import('date-fns/locale/bg').then((m) => m.bg),
	bn: () => import('date-fns/locale/bn').then((m) => m.bn),
	bs: () => import('date-fns/locale/bs').then((m) => m.bs),
	ca: () => import('date-fns/locale/ca').then((m) => m.ca),
	ckb: () => import('date-fns/locale/ckb').then((m) => m.ckb),
	cs: () => import('date-fns/locale/cs').then((m) => m.cs),
	cy: () => import('date-fns/locale/cy').then((m) => m.cy),
	da: () => import('date-fns/locale/da').then((m) => m.da),
	de: () => import('date-fns/locale/de').then((m) => m.de),
	el: () => import('date-fns/locale/el').then((m) => m.el),
	eo: () => import('date-fns/locale/eo').then((m) => m.eo),
	es: () => import('date-fns/locale/es').then((m) => m.es),
	et: () => import('date-fns/locale/et').then((m) => m.et),
	eu: () => import('date-fns/locale/eu').then((m) => m.eu),
	fi: () => import('date-fns/locale/fi').then((m) => m.fi),
	fr: () => import('date-fns/locale/fr').then((m) => m.fr),
	fy: () => import('date-fns/locale/fy').then((m) => m.fy),
	gd: () => import('date-fns/locale/gd').then((m) => m.gd),
	gl: () => import('date-fns/locale/gl').then((m) => m.gl),
	gu: () => import('date-fns/locale/gu').then((m) => m.gu),
	he: () => import('date-fns/locale/he').then((m) => m.he),
	hi: () => import('date-fns/locale/hi').then((m) => m.hi),
	hr: () => import('date-fns/locale/hr').then((m) => m.hr),
	hu: () => import('date-fns/locale/hu').then((m) => m.hu),
	hy: () => import('date-fns/locale/hy').then((m) => m.hy),
	id: () => import('date-fns/locale/id').then((m) => m.id),
	is: () => import('date-fns/locale/is').then((m) => m.is),
	it: () => import('date-fns/locale/it').then((m) => m.it),
	ja: () => import('date-fns/locale/ja').then((m) => m.ja),
	ka: () => import('date-fns/locale/ka').then((m) => m.ka),
	kk: () => import('date-fns/locale/kk').then((m) => m.kk),
	km: () => import('date-fns/locale/km').then((m) => m.km),
	kn: () => import('date-fns/locale/kn').then((m) => m.kn),
	ko: () => import('date-fns/locale/ko').then((m) => m.ko),
	lb: () => import('date-fns/locale/lb').then((m) => m.lb),
	lt: () => import('date-fns/locale/lt').then((m) => m.lt),
	lv: () => import('date-fns/locale/lv').then((m) => m.lv),
	mk: () => import('date-fns/locale/mk').then((m) => m.mk),
	mn: () => import('date-fns/locale/mn').then((m) => m.mn),
	ms: () => import('date-fns/locale/ms').then((m) => m.ms),
	nb: () => import('date-fns/locale/nb').then((m) => m.nb),
	nl: () => import('date-fns/locale/nl').then((m) => m.nl),
	nn: () => import('date-fns/locale/nn').then((m) => m.nn),
	oc: () => import('date-fns/locale/oc').then((m) => m.oc),
	pl: () => import('date-fns/locale/pl').then((m) => m.pl),
	pt: () => import('date-fns/locale/pt').then((m) => m.pt),
	ro: () => import('date-fns/locale/ro').then((m) => m.ro),
	ru: () => import('date-fns/locale/ru').then((m) => m.ru),
	sk: () => import('date-fns/locale/sk').then((m) => m.sk),
	sl: () => import('date-fns/locale/sl').then((m) => m.sl),
	sq: () => import('date-fns/locale/sq').then((m) => m.sq),
	sr: () => import('date-fns/locale/sr').then((m) => m.sr),
	sv: () => import('date-fns/locale/sv').then((m) => m.sv),
	ta: () => import('date-fns/locale/ta').then((m) => m.ta),
	te: () => import('date-fns/locale/te').then((m) => m.te),
	th: () => import('date-fns/locale/th').then((m) => m.th),
	tr: () => import('date-fns/locale/tr').then((m) => m.tr),
	uk: () => import('date-fns/locale/uk').then((m) => m.uk),
	uz: () => import('date-fns/locale/uz').then((m) => m.uz),
	vi: () => import('date-fns/locale/vi').then((m) => m.vi),
};
const locales = new Map<string, Locale>([['en', enUS]]);
export async function loadDateFnsLocale(code: string): Promise<Locale> {
	const cached = locales.get(code);
	if (cached) return cached;
	if (!Object.hasOwn(DATE_FNS_LOCALE_LOADERS, code)) return enUS;
	const locale = await DATE_FNS_LOCALE_LOADERS[code]();
	locales.set(code, locale);
	return locale;
}
export function useDateFnsLocale(code: string): Locale {
	const [, refresh] = React.useReducer((value: number) => value + 1, 0);
	// Synchronize the rendered locale with the asynchronously loaded module. A failed
	// chunk load (offline first boot, CDN outage) must never reach the render path:
	// dates stay in English until the next successful load, nothing else changes.
	React.useEffect(() => {
		if (!locales.has(code)) {
			void loadDateFnsLocale(code).then(refresh, () => undefined);
		}
	}, [code]);
	return locales.get(code) ?? enUS;
}
