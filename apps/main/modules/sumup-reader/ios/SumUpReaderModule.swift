import ExpoModulesCore
import SumUpSDK
import UIKit

struct SumUpLoginOptions: Record {
  @Field var accessToken: String?
}
struct SumUpCheckoutOptions: Record {
  @Field(.required) var amount: String = ""
  @Field(.required) var currency: String = ""
  @Field(.required) var title: String = ""
  @Field(.required) var foreignTransactionId: String = ""
  @Field var tipOnReader: Bool = false
  @Field var skipSuccessScreen: Bool = true
}

public class SumUpReaderModule: Module {
  // SDK setup and screen ownership survive JS reloads. Every access is on the main queue.
  private static var affiliateKey: String?
  private static var busy = false

  private func requireSetup() throws {
    guard Self.affiliateKey != nil else { throw Exception(name: "SumUpSetup", description: "Set up SumUp first") }
  }
  private func controller() throws -> UIViewController {
    guard let controller = appContext?.utilities?.currentViewController() else {
      throw Exception(name: "SumUpActivity", description: "No active screen to present SumUp")
    }
    return controller
  }
  private func begin() throws {
    try requireSetup()
    guard !Self.busy else { throw Exception(name: "SumUpBusy", description: "A SumUp operation is already in progress") }
    Self.busy = true
  }
  private func status() -> [String: Any]? {
    guard Self.affiliateKey != nil, let reader = SumUpSDK.lastReaderStatus else { return nil }
    return ["connected": reader.isActive, "serial": reader.serialNumber,
            "model": String(describing: reader.readerType), "battery": reader.batteryLevel]
  }
  private func emitStatus() {
    sendEvent("onReaderStatus", ["reader": status() as Any? ?? NSNull()])
  }
  private func complete(_ promise: Promise, _ success: Bool, _ error: Error?) {
    Self.busy = false
    emitStatus()
    if let error { promise.reject(error) }
    else if !success { promise.reject("SumUpCancelled", "SumUp login was cancelled") }
    else { promise.resolve(nil) }
  }

  public func definition() -> ModuleDefinition {
    Name("SumUpReader")
    Events("onReaderStatus")
    AsyncFunction("setup") { (key: String) in
      guard !key.isEmpty else { throw Exception(name: "SumUpKey", description: "Missing SumUp affiliate key") }
      if let current = Self.affiliateKey {
        guard current == key else { throw Exception(name: "SumUpKey", description: "Restart WCPOS to change the SumUp affiliate key") }
        return
      }
      // SMPSumUpSDK is imported into Swift as SumUpSDK in the 7.1 SDK.
      SumUpSDK.setup(affiliateKey: key)
      Self.affiliateKey = key
      self.emitStatus()
    }.runOnQueue(.main)
    AsyncFunction("isLoggedIn") { Self.affiliateKey != nil && SumUpSDK.isLoggedIn }.runOnQueue(.main)
    AsyncFunction("login") { (options: SumUpLoginOptions, promise: Promise) in
      let controller = try self.controller()
      try self.begin()
      if SumUpSDK.isLoggedIn { self.complete(promise, true, nil); return }
      let completion: (Bool, Error?) -> Void = { success, error in
        self.complete(promise, success, error)
      }
      if let token = options.accessToken {
        SumUpSDK.login(withToken: token, completion: completion)
      } else {
        SumUpSDK.presentLogin(from: controller, animated: true, completionBlock: completion)
      }
    }.runOnQueue(.main)
    AsyncFunction("logout") { (promise: Promise) in
      try self.begin()
      SumUpSDK.logout { success, error in self.complete(promise, success, error) }
    }.runOnQueue(.main)
    AsyncFunction("merchant") { () -> [String: String]? in
      try self.requireSetup()
      guard let merchant = SumUpSDK.currentMerchant else { return nil }
      return ["merchantCode": merchant.merchantCode, "currencyCode": merchant.currencyCode]
    }.runOnQueue(.main)
    AsyncFunction("openReaderSettings") { (promise: Promise) in
      let controller = try self.controller()
      try self.begin()
      SumUpSDK.presentCardReaderSettings(from: controller, animated: true) { _, error in
        self.complete(promise, true, error)
      }
    }.runOnQueue(.main)
    AsyncFunction("readerStatus") { self.status() }.runOnQueue(.main)
    AsyncFunction("isTipOnReaderAvailable") { () -> Bool in
      try self.requireSetup()
      return SumUpSDK.isTipOnCardReaderAvailable
    }.runOnQueue(.main)
    AsyncFunction("prepareForCheckout") {
      try self.requireSetup()
      SumUpSDK.prepareForCheckout()
    }.runOnQueue(.main)
    AsyncFunction("checkout") { (options: SumUpCheckoutOptions, promise: Promise) in
      let controller = try self.controller()
      let total = NSDecimalNumber(string: options.amount, locale: Locale(identifier: "en_US_POSIX"))
      guard total != .notANumber else { throw Exception(name: "SumUpAmount", description: "Invalid SumUp amount") }
      let request = CheckoutRequest(total: total, title: options.title, currencyCode: options.currency)
      request.foreignTransactionID = options.foreignTransactionId
      request.tipOnCardReaderIfAvailable = options.tipOnReader
      if options.skipSuccessScreen { request.skipScreenOptions = .success }
      try self.begin()
      SumUpSDK.checkout(with: request, from: controller) { result, error in
        Self.busy = false
        let info = result?.additionalInfo ?? [:]
        let card = info["card"] as? [String: Any] ?? [:]
        let failure = error as NSError?
        // A missing result is not a merchant cancellation or a successful charge.
        let outcome = error != nil ? "failed" : result == nil ? "unknown" : result!.success ? "success" : "cancelled"
        var response: [String: Any] = ["outcome": outcome]
        response["transactionCode"] = result?.transactionCode
        response["amount"] = info["amount"].map { String(describing: $0) }
        response["tipAmount"] = info["tip_amount"].map { String(describing: $0) }
        response["currency"] = info["currency"]
        response["cardType"] = card["card_type"]
        response["last4"] = card["last_4_digits"]
        response["message"] = failure?.localizedDescription
        response["resultCode"] = failure?.code
        promise.resolve(response)
        self.emitStatus()
      }
    }.runOnQueue(.main)
  }
}
