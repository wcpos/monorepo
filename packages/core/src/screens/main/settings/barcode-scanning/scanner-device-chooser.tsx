/**
 * Non-Electron platforms need no custom scanner chooser: a browser shows its own
 * native Web Serial / WebHID picker, and native (iOS/Android) has no serial/HID
 * transport. Only the `.electron.tsx` variant renders a chooser (#742).
 */
export function ScannerDeviceChooser() {
	return null;
}
