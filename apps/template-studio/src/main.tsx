import { createRoot } from 'react-dom/client';

import { loadBarcodeLibrary } from '@wcpos/receipt-renderer';

import { App } from './App';
import './styles.css';

// Receipts render synchronously here; the barcode library is lazy in the renderer, so
// load it before the first render. A failed load still renders (barcodes as placeholders).
void loadBarcodeLibrary()
	.catch(() => undefined)
	.then(() => createRoot(document.getElementById('root')!).render(<App />));
