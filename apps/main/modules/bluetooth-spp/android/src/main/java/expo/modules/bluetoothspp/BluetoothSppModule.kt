package expo.modules.bluetoothspp

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Bluetooth Classic (SPP / RFCOMM) for receipt printers, Android only.
 *
 * The phone counterpart of the desktop serial lane: a printer paired in Android's Bluetooth
 * settings is opened as an RFCOMM socket on the Serial Port Profile UUID and fed raw ESC/POS.
 * iOS has no third-party SPP, so this module does not exist there and JS treats "module absent"
 * as "not this platform". Sockets are kept open between jobs; JS decides when to let go.
 *
 * Every failure is a coded exception with one cashier-readable line: the printer is not paired,
 * Bluetooth is off or not ours to use, or the printer is not answering.
 */
class BluetoothSppModule : Module() {
	companion object {
		private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
		private const val READ_POLL_MS = 50L
		const val ERR_NOT_PAIRED = "ERR_NOT_PAIRED"
		const val ERR_BLUETOOTH_UNAVAILABLE = "ERR_BLUETOOTH_UNAVAILABLE"
		const val ERR_NOT_RESPONDING = "ERR_NOT_RESPONDING"
		const val ERR_NOT_CONNECTED = "ERR_NOT_CONNECTED"
		const val NOT_PAIRED = "Bluetooth printer is not paired with this phone. Pair it in Bluetooth settings, then scan again."
		const val UNAVAILABLE = "Bluetooth is off or not allowed for this app."
		const val NOT_RESPONDING = "Bluetooth printer is not responding. Turn it off and on again, then try again."
	}

	private val sockets = ConcurrentHashMap<String, BluetoothSocket>()
	// One worker: RFCOMM connects block for seconds and two printers never print at once here.
	private val executor = Executors.newSingleThreadExecutor()

	private val context: Context
		get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "React context is gone", null)

	private fun hasConnectPermission(): Boolean =
		Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
			ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
			PackageManager.PERMISSION_GRANTED

	private fun adapter(): BluetoothAdapter {
		val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
		val adapter = manager?.adapter
		if (adapter == null || !adapter.isEnabled || !hasConnectPermission()) {
			throw CodedException(ERR_BLUETOOTH_UNAVAILABLE, UNAVAILABLE, null)
		}
		return adapter
	}

	private fun isPrinterClass(device: BluetoothDevice): Boolean {
		val deviceClass = device.bluetoothClass ?: return false
		// Major class IMAGING with the printer minor bit; clones often report "uncategorised", so
		// JS also accepts printer-like names.
		return deviceClass.majorDeviceClass == BluetoothClass.Device.Major.IMAGING &&
			(deviceClass.deviceClass and 0x80) != 0
	}

	private fun openSocket(adapter: BluetoothAdapter, address: String): BluetoothSocket {
		val device = try {
			adapter.getRemoteDevice(address)
		} catch (e: IllegalArgumentException) {
			throw CodedException(ERR_NOT_PAIRED, NOT_PAIRED, e)
		}
		if (device.bondState != BluetoothDevice.BOND_BONDED) {
			throw CodedException(ERR_NOT_PAIRED, NOT_PAIRED, null)
		}
		// Discovery steals the radio; a connect attempted during it fails or crawls.
		adapter.cancelDiscovery()
		try {
			val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
			socket.connect()
			return socket
		} catch (first: IOException) {
			// Clone printers with a broken SDP record still answer on channel 1 through the
			// reflective constructor every printer library ends up using.
			try {
				val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
				val socket = method.invoke(device, 1) as BluetoothSocket
				socket.connect()
				return socket
			} catch (second: Exception) {
				throw CodedException(ERR_NOT_RESPONDING, NOT_RESPONDING, first)
			}
		}
	}

	private fun closeQuietly(address: String) {
		sockets.remove(address)?.let { socket ->
			try {
				socket.close()
			} catch (_: IOException) {
				// A link the printer already dropped is fine.
			}
		}
	}

	private fun run(promise: Promise, block: () -> Any?) {
		executor.execute {
			try {
				promise.resolve(block())
			} catch (e: CodedException) {
				promise.reject(e)
			} catch (e: Exception) {
				promise.reject(CodedException(ERR_NOT_RESPONDING, NOT_RESPONDING, e))
			}
		}
	}

	override fun definition() = ModuleDefinition {
		Name("BluetoothSpp")

		Function("bondedDevices") {
			adapter().bondedDevices.map { device ->
				mapOf(
					"address" to device.address,
					"name" to (device.name ?: ""),
					"printerClass" to isPrinterClass(device)
				)
			}
		}

		Function("isConnected") { address: String -> sockets[address]?.isConnected == true }

		AsyncFunction("connect") { address: String, promise: Promise ->
			run(promise) {
				val existing = sockets[address]
				if (existing?.isConnected == true) return@run null
				closeQuietly(address)
				sockets[address] = openSocket(adapter(), address)
				null
			}
		}

		AsyncFunction("write") { address: String, base64: String, promise: Promise ->
			run(promise) {
				val socket = sockets[address]?.takeIf { it.isConnected }
					?: throw CodedException(ERR_NOT_CONNECTED, NOT_RESPONDING, null)
				try {
					val stream = socket.outputStream
					stream.write(Base64.decode(base64, Base64.DEFAULT))
					stream.flush()
				} catch (e: IOException) {
					closeQuietly(address)
					throw CodedException(ERR_NOT_RESPONDING, NOT_RESPONDING, e)
				}
				null
			}
		}

		// Returns whatever the printer sent within the window, base64, or null when it said nothing.
		AsyncFunction("read") { address: String, timeoutMs: Int, promise: Promise ->
			run(promise) {
				val socket = sockets[address]?.takeIf { it.isConnected }
					?: throw CodedException(ERR_NOT_CONNECTED, NOT_RESPONDING, null)
				val deadline = System.currentTimeMillis() + timeoutMs
				try {
					val input = socket.inputStream
					while (System.currentTimeMillis() < deadline) {
						val available = input.available()
						if (available > 0) {
							val buffer = ByteArray(available)
							val count = input.read(buffer)
							return@run if (count > 0) Base64.encodeToString(buffer, 0, count, Base64.NO_WRAP) else null
						}
						Thread.sleep(READ_POLL_MS)
					}
				} catch (e: IOException) {
					closeQuietly(address)
					throw CodedException(ERR_NOT_RESPONDING, NOT_RESPONDING, e)
				}
				null
			}
		}

		AsyncFunction("disconnect") { address: String, promise: Promise ->
			run(promise) {
				closeQuietly(address)
				null
			}
		}

		OnDestroy {
			sockets.keys.toList().forEach { closeQuietly(it) }
			executor.shutdownNow()
		}
	}
}
