import { AreaPage } from '../components/navigation-area/area-page';

export { BarcodeScanning } from './barcode-scanning';
export { CardReadersSettings } from './card-readers';
export { CustomerDisplaySettings } from './customer-display';
export { GeneralSettings } from './general';
export { PrintingSettings } from './printing';
export { TaxSettings } from './tax';
export { ThemeSettings } from './theme';
export { SettingsSection } from './components/settings-section';
export { SettingsRow } from './components/settings-row';
export { SettingsDangerZone } from './components/settings-danger-zone';

/**
 * A settings page is an area page (`AreaPage`): one card on the page ground, heading inside.
 * Kept as a name so the settings routes read as settings.
 */
export const SettingsPage = AreaPage;
