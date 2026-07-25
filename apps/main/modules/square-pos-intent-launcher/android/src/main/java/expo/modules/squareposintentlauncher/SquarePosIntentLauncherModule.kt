package expo.modules.squareposintentlauncher

import android.content.Intent
import androidx.core.os.bundleOf
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.toCodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val REQUEST_CODE = 8121
private const val SQUARE_POS_ACTION = "com.squareup.pos.action.CHARGE"
private const val SQUARE_POS_PACKAGE = "com.squareup"

private class SquarePosActivityAlreadyStartedException :
	CodedException("A Square Point of Sale activity is already running.")

class SquarePosIntentLauncherModule : Module() {
	private var pendingPromise: Promise? = null

	override fun definition() = ModuleDefinition {
		Name("SquarePosIntentLauncher")

		AsyncFunction("startActivityAsync") { extra: Map<String, Any>, promise: Promise ->
			if (pendingPromise != null) {
				throw SquarePosActivityAlreadyStartedException()
			}

			val values = extra.mapValues { (_, value) ->
				if (value is Double) {
					if (value > Int.MAX_VALUE || value < Int.MIN_VALUE) value.toLong() else value.toInt()
				} else {
					value
				}
			}
			val intent = Intent(SQUARE_POS_ACTION)
				.setPackage(SQUARE_POS_PACKAGE)
				.putExtras(bundleOf(*values.toList().toTypedArray()))

			try {
				pendingPromise = promise
				appContext.throwingActivity.startActivityForResult(intent, REQUEST_CODE)
			} catch (error: Throwable) {
				pendingPromise = null
				promise.reject(error.toCodedException())
			}
		}

		OnActivityResult { _, payload ->
			if (payload.requestCode != REQUEST_CODE) {
				return@OnActivityResult
			}

			pendingPromise?.resolve()
			pendingPromise = null
		}
	}
}
