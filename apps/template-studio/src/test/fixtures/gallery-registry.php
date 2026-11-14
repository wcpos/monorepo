<?php
return array(
			'detailed-receipt' => array(
				/* translators: Gallery template name shown in the admin Template Gallery. */
				'title'         => __( 'Detailed Receipt', 'woocommerce-pos' ),
				/* translators: Gallery template description shown in the admin Template Gallery. */
				'description'   => __( 'Extended info with SKU, unit price, full tax breakdown, customer address, and cashier details.', 'woocommerce-pos' ),
				'type'          => 'receipt',
				'category'      => 'receipt',
				'engine'        => 'logicless',
				'output_type'   => 'html',
				'paper_width'   => null,
				'version'       => 1,
				'preview_data'  => 'base-receipt',
			),
			'narrow-receipt' => array(
				/* translators: Gallery template name shown in the admin Template Gallery. */
				'title'         => __( 'Narrow Receipt', 'woocommerce-pos' ),
				/* translators: Gallery template description shown in the admin Template Gallery. */
				'description'   => __( 'Compact monospace receipt sized for narrow paper or HTML-capable thermal printers. Prints cleanly in black and white.', 'woocommerce-pos' ),
				'type'          => 'receipt',
				'category'      => 'receipt',
				'engine'        => 'logicless',
				'output_type'   => 'html',
				'version'       => 1,
				'preview_data'  => 'base-receipt',
			),
			'thermal-simple-80mm-rtl' => array(
				/* translators: Gallery template name shown in the admin Template Gallery. The (RTL) suffix marks right-to-left layout. */
				'title'         => __( 'Simple Thermal Receipt 80mm (RTL)', 'woocommerce-pos' ),
				/* translators: Gallery template description shown in the admin Template Gallery. CP864 / Windows-1256 are printer codepages; keep them verbatim. */
				'description'   => __( 'Right-to-left thermal receipt for 80mm printers. Mirrors column alignments for Arabic, Hebrew, Persian and Urdu. Requires a printer that supports an Arabic codepage (CP864 or Windows-1256) — check your printer\'s manual before ordering.', 'woocommerce-pos' ),
				'type'          => 'receipt',
				'category'      => 'receipt',
				'direction'     => 'rtl',
				'engine'        => 'thermal',
				'output_type'   => 'escpos',
				'paper_width'   => '80mm',
				'version'       => 1,
				'preview_data'  => 'standard-receipt-rtl',
			),
);
