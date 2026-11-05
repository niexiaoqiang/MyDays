import Foundation

/// Settings shared by the menu bar app and `mydays-collect`, stored in one file readable only by the user.
/// The token lives here rather than in the Keychain because ad-hoc signed builds change identity on every
/// rebuild, which makes the Keychain ask for permission again each time.
public struct AppSettings: Codable, Sendable, Equatable {
    public var serverURL = "http://localhost:4173"
    public var token = ""
    public var intervalMinutes = 15
    public var paused = false

    public init() {}

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let fallback = AppSettings()
        serverURL = try values.decodeIfPresent(String.self, forKey: .serverURL) ?? fallback.serverURL
        token = try values.decodeIfPresent(String.self, forKey: .token) ?? fallback.token
        intervalMinutes = try values.decodeIfPresent(Int.self, forKey: .intervalMinutes) ?? fallback.intervalMinutes
        paused = try values.decodeIfPresent(Bool.self, forKey: .paused) ?? fallback.paused
    }

    public static var supportDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("MyDaysBar")
    }

    private static var fileURL: URL { supportDirectory.appendingPathComponent("settings.json") }

    public static func load() -> AppSettings {
        guard let data = try? Data(contentsOf: fileURL) else { return AppSettings() }
        return (try? JSONDecoder().decode(AppSettings.self, from: data)) ?? AppSettings()
    }

    public func save() throws {
        try FileManager.default.createDirectory(at: Self.supportDirectory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(self).write(to: Self.fileURL, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: Self.fileURL.path)
    }

    public func collectorConfig() -> CollectorConfig? {
        guard let url = URL(string: serverURL.trimmingCharacters(in: .whitespaces)), url.scheme == "http" || url.scheme == "https" else {
            return nil
        }
        return CollectorConfig(
            serverURL: url, token: token.trimmingCharacters(in: .whitespacesAndNewlines),
            stateDir: Self.supportDirectory.appendingPathComponent("collector").path
        )
    }
}
