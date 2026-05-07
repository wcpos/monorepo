import type { PathSegment } from '../../lib/path-utils';
import type { TemplateEngine, ThermalColumns } from '../../studio-core';

interface WooCommerceSectionProps {
	engine: TemplateEngine | null;
	currency: string;
	locale: string;
	displayTax: string;
	pricesEnteredWithTax: boolean;
	roundingMode: string;
	printerModel: string;
	language: string;
	thermalColumns: ThermalColumns;
	onChangePath: (path: PathSegment[], value: unknown) => void;
	onPrinterModelChange: (value: string) => void;
	onLanguageChange: (value: string) => void;
	onThermalColumnsChange: (value: ThermalColumns) => void;
}

const COMMON_CURRENCIES = [
	'USD',
	'EUR',
	'GBP',
	'JPY',
	'CAD',
	'AUD',
	'CHF',
	'CNY',
	'INR',
	'SEK',
	'NOK',
	'DKK',
	'AED',
	'SAR',
	'BRL',
	'MXN',
	'NZD',
	'SGD',
	'HKD',
	'KRW',
];

const COMMON_LOCALES = [
	'en_US',
	'en_GB',
	'en_AU',
	'en_CA',
	'es_ES',
	'es_MX',
	'fr_FR',
	'fr_CA',
	'de_DE',
	'it_IT',
	'pt_BR',
	'pt_PT',
	'nl_NL',
	'sv_SE',
	'da_DK',
	'nb_NO',
	'ja_JP',
	'zh_CN',
	'zh_TW',
	'ko_KR',
	'ar_SA',
	'ar_AE',
	'he_IL',
	'ru_RU',
];

const PRINTER_MODELS = [
	'epson-tm-t20',
	'epson-tm-t82',
	'epson-tm-t88iv',
	'epson-tm-t88v',
	'epson-tm-m30',
	'star-tsp-100',
	'star-tsp-650',
	'generic',
];

const LANGUAGES: { value: string; label: string }[] = [
	{ value: 'esc-pos', label: 'ESC/POS' },
	{ value: 'star-prnt', label: 'StarPRNT' },
	{ value: 'star-line', label: 'Star Line' },
];

const THERMAL_COLUMNS: { value: ThermalColumns; label: string }[] = [
	{ value: 32, label: '32 (58mm)' },
	{ value: 42, label: '42 (generic 80mm)' },
	{ value: 48, label: '48 (48-CPL 80mm)' },
];

export function WooCommerceSection(props: WooCommerceSectionProps) {
	const {
		engine,
		currency,
		locale,
		displayTax,
		pricesEnteredWithTax,
		roundingMode,
		printerModel,
		language,
		thermalColumns,
		onChangePath,
		onPrinterModelChange,
		onLanguageChange,
		onThermalColumnsChange,
	} = props;
	const isThermal = engine === 'thermal';
	const currencyOptions = COMMON_CURRENCIES.includes(currency)
		? COMMON_CURRENCIES
		: [currency, ...COMMON_CURRENCIES].filter(Boolean);
	const localeOptions = COMMON_LOCALES.includes(locale)
		? COMMON_LOCALES
		: [locale, ...COMMON_LOCALES].filter(Boolean);

	return (
		<div className="woo-section">
			<div className="grid-2">
				<div className="row">
					<label htmlFor="woo-currency">Currency</label>
					<select
						id="woo-currency"
						value={currency}
						onChange={(event) => onChangePath(['order', 'currency'], event.target.value)}
					>
						{currencyOptions.map((code) => (
							<option key={code} value={code}>
								{code}
							</option>
						))}
					</select>
				</div>
				<div className="row">
					<label htmlFor="woo-locale">Locale</label>
					<select
						id="woo-locale"
						value={locale}
						onChange={(event) => onChangePath(['presentation_hints', 'locale'], event.target.value)}
					>
						{localeOptions.map((code) => (
							<option key={code} value={code}>
								{code}
							</option>
						))}
					</select>
				</div>
			</div>

			<div className="toggle-row">
				<label htmlFor="woo-prices-with-tax">Prices entered with tax</label>
				<input
					id="woo-prices-with-tax"
					type="checkbox"
					checked={pricesEnteredWithTax}
					onChange={(event) =>
						onChangePath(['presentation_hints', 'prices_entered_with_tax'], event.target.checked)
					}
				/>
			</div>

			<div className="row full">
				<label>Display tax</label>
				<div className="radio-row" role="radiogroup" aria-label="Display tax">
					{(['incl', 'excl', 'hidden'] as const).map((option) => (
						<button
							key={option}
							type="button"
							aria-pressed={displayTax === option}
							onClick={() => onChangePath(['presentation_hints', 'display_tax'], option)}
						>
							{option}
						</button>
					))}
				</div>
			</div>

			<div className="row full">
				<label>Rounding</label>
				<div className="radio-row" role="radiogroup" aria-label="Rounding mode">
					{(['per-line', 'per-total'] as const).map((option) => (
						<button
							key={option}
							type="button"
							aria-pressed={roundingMode === option}
							onClick={() => onChangePath(['presentation_hints', 'rounding_mode'], option)}
						>
							{option}
						</button>
					))}
				</div>
			</div>

			<div className={isThermal ? 'grid-2' : 'grid-2 muted'}>
				<div className="row">
					<label htmlFor="woo-printer">Printer model</label>
					<select
						id="woo-printer"
						value={printerModel}
						onChange={(event) => onPrinterModelChange(event.target.value)}
						disabled={!isThermal}
					>
						<option value="">Default</option>
						{PRINTER_MODELS.map((model) => (
							<option key={model} value={model}>
								{model}
							</option>
						))}
					</select>
				</div>
				<div className="row">
					<label htmlFor="woo-language">Language</label>
					<select
						id="woo-language"
						value={language}
						onChange={(event) => onLanguageChange(event.target.value)}
						disabled={!isThermal}
					>
						{LANGUAGES.map((entry) => (
							<option key={entry.value} value={entry.value}>
								{entry.label}
							</option>
						))}
					</select>
				</div>
				<div className="row">
					<label htmlFor="woo-thermal-columns">Characters per line</label>
					<select
						id="woo-thermal-columns"
						value={String(thermalColumns)}
						onChange={(event) =>
							onThermalColumnsChange(Number(event.target.value) as ThermalColumns)
						}
						disabled={!isThermal}
					>
						{THERMAL_COLUMNS.map((entry) => (
							<option key={entry.value} value={entry.value}>
								{entry.label}
							</option>
						))}
					</select>
				</div>
			</div>
			{isThermal ? (
				<p className="field-help">
					Match this to the printer or simulator Characters per line setting.
				</p>
			) : null}
		</div>
	);
}
