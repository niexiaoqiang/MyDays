import Foundation

public struct APIError: Error, Sendable {
    public var status: Int
    public var code: String
    public var message: String
}

/// The MyDays collector endpoints, authenticated with an ingest token (`mdk_…`).
struct AgentAPI: Sendable {
    var baseURL: URL
    var token: String

    func config() async throws -> RemoteConfig {
        try JSONDecoder().decode(RemoteConfig.self, from: await request("GET", "/api/agent/config"))
    }

    /// Returns how many turns MyDays inserted or updated.
    func send(_ turns: [Turn]) async throws -> Int {
        struct Body: Encodable { var turns: [Turn] }
        struct Accepted: Decodable { var accepted: Int? }
        let data = try await request("POST", "/api/agent/turns", body: try JSONEncoder().encode(Body(turns: turns)))
        return (try? JSONDecoder().decode(Accepted.self, from: data))?.accepted ?? 0
    }

    func reportStatus(_ gitDirs: [GitDirStatus]) async throws {
        struct Body: Encodable { var gitDirs: [GitDirStatus] }
        _ = try await request("POST", "/api/agent/collector-status", body: try JSONEncoder().encode(Body(gitDirs: gitDirs)))
    }

    private func request(_ method: String, _ path: String, body: Data? = nil) async throws -> Data {
        // Appended as text so a server mounted under a sub-path keeps that path.
        let base = baseURL.absoluteString.hasSuffix("/") ? String(baseURL.absoluteString.dropLast()) : baseURL.absoluteString
        guard let url = URL(string: base + path) else { throw URLError(.badURL) }
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            struct Failure: Decodable {
                struct Detail: Decodable { var code: String?; var message: String? }
                var error: Detail?
            }
            let detail = (try? JSONDecoder().decode(Failure.self, from: data))?.error
            throw APIError(status: status, code: detail?.code ?? "HTTP_\(status)", message: detail?.message ?? "HTTP \(status)")
        }
        return data
    }
}
