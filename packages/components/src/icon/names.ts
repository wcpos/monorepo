import type * as React from 'react';

import type { SvgProps } from 'react-native-svg';

// Generated from scripts/icons/vocabulary.json; do not edit.
export const ICON_NAMES = [
	'viewGrid', // Products as tiles (the grid view); also the placeholder on a category tile with no image
	'viewList', // Products as a list (rows); the other half of the grid/list toggle
	'filters', // Open the filter / column settings
	'expand', // Expand a collapsed section (vertical)
	'collapse', // Collapse a section (vertical)
	'dragHandle', // Drag to reorder (horizontal grip)
	'dragHandleVertical', // Drag to reorder (vertical grip)
	'tree', // A nested list (categories tree)
	'more', // The overflow menu on a row (⋮)
	'moreCircle', // More, in a circle
	'menu', // The rail / hamburger
	'chevronLeft', // Back
	'chevronRight', // Forward / drill into a row (a single chevron, never circled)
	'chevronDown', // Open / expand
	'chevronUp', // Close / collapse
	'caretLeft', //
	'caretRight', //
	'arrowUp', // Sort / move up
	'arrowDown', // Sort / move down
	'arrowLeft', //
	'arrowRight', //
	'openExternal', // Opens in the browser / outside the app
	'signOut', // Log out
	'swap', // Switch between two things (e.g. store, direction)
	'refresh', // Refresh / sync now
	'undo', // Undo / history
	'search', // Search
	'close', // Close / clear / dismiss
	'check', // Done / selected
	'cart', // The cart
	'addToCart', // Add to cart
	'cartDone', // Cart checked out / completed
	'basket', // Basket (alternative cart)
	'register', // The register / till
	'store', // The store (rail glyph)
	'card', // Card payment
	'cash', // Cash payment
	'currency', // Money / currency / price
	'discount', // Discount / coupon
	'percent', // Percent key
	'giftCard', // Gift card
	'gift', // Gift / free item
	'receipt', // Receipt
	'invoice', // Invoice / order document
	'print', // Print
	'calculator', // Calculator / manual amount
	'backspace', // Keypad delete
	'plus', // Add / keypad plus
	'minus', // Subtract / keypad minus
	'plusMinus', // Toggle sign
	'divide', // Divide key
	'equals', // Equals key
	'increment', // Quantity up (stepper)
	'decrement', // Quantity down (stepper)
	'split', // Split payment / split a line
	'refund', // Refund
	'cashDrawer', // The cash drawer
	'paidIn', // Cash into the drawer (paid in)
	'paidOut', // Cash out of the drawer (paid out)
	'customer', // A customer / the user
	'customers', // Customers (plural)
	'addCustomer', // Add a customer
	'cashier', // The cashier / staff member
	'customerCard', // Customer details (ID card)
	'address', // A postal address (billing or shipping); a location pin
	'bot', // An automated / system actor
	'product', // A product
	'packageOpen', // An opened package
	'inventory', // Stock / boxes
	'warehouse', // Warehouse / stock location
	'shipping', // Shipping
	'barcode', // Barcode
	'scan', // Scan a barcode
	'tag', // A tag / label
	'tags', // Tags (plural)
	'category', // A category (folder)
	'categories', // Categories (plural)
	'featured', // Featured
	'bookmark', // Saved / bookmarked
	'confirmed', // Success / paid / complete
	'rejected', // Failed / cancelled
	'alert', // Error / attention (circle)
	'warning', // Warning (triangle)
	'info', // Info
	'help', // Help / question
	'support', // Support / contact us
	'pending', // Pending / waiting (clock)
	'onHold', // On hold (pause)
	'blocked', // Blocked / not allowed
	'notifications', // Notifications / alerts
	'health', // Health / diagnostics
	'emergency', // Medical cross / required
	'dot', // A status dot
	'lock', // Pro-gated / locked
	'show', // Show (eye)
	'hide', // Hide (eye off)
	'note', // A note / memo
	'noteDone', // A checked note
	'noteInfo', // A note with info
	'message', // A message / comment
	'messageMoney', // A payment note
	'messagePlus', // Add a message
	'edit', // Edit
	'delete', // Delete / remove
	'download', // Download / export
	'merge', // Merge (e.g. carts, customers)
	'reports', // Reports / analytics
	'settings', // Settings
	'calendar', // Date / calendar
	'globe', // Language / region / web
	'desktop', // A desktop / this device
	'wordpress', // WordPress (brand)
	'icons', // Icons (this setting)
	'contrast', // Theme: follow the system
	'sun', // Theme: light
	'moon', // Theme: dark
	'sunset', // Theme: sunset
	'wave', // Theme: ocean
	'wcpos', // The WCPOS mark (brand; the same glyph in every set)
] as const;
export type IconName = (typeof ICON_NAMES)[number];
export type IconSet = Record<IconName, React.FC<SvgProps>>;
