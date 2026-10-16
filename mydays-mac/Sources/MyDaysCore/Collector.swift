import Foundation

public struct CollectorConfig: Sendable {
    public var serverURL: URL
    public var token: String
    public var claudeDir: String
    public var codexDir: String
    public var stateDir: String
    public var home: String

    public init(
        serverURL: URL, token: String,
        claudeDir: String = NSHomeDirectory() + "/.claude/projects",
        codexDir: String = NSHomeDirectory() + "/.codex/sessions",
        stateDir: String, home: String = NSHomeDirectory()
    ) {
        self.serverURL = serverURL
        self.token = token
        self.claudeDir = claudeDir
        self.codexDir = codexDir
        self.stateDir = stateDir
        self.home = home
    }
}

/// What MyDays tells the collector at the start of every round (`GET /api/agent/config`).
public struct RemoteConfig: Codable, Sendable {
    public var enabled: Bool
    public var maxPromptChars: Int
    public var maxReplyChars: Int
    public var windowDays: Int
    public var gitAuthorEmails: [String]
    public var gitRepoDirs: [String]

    public static let defaults = RemoteConfig(
        enabled: true, maxPromptChars: 600, maxReplyChars: 1500, windowDays: 8, gitAuthorEmails: [], gitRepoDirs: []
    )

    public init(enabled: Bool, maxPromptChars: Int, maxReplyChars: Int, windowDays: Int, gitAuthorEmails: [String], gitRepoDirs: [String]) {
        self.enabled = enabled
        self.maxPromptChars = maxPromptChars
        self.maxReplyChars = maxReplyChars
        self.windowDays = windowDays
        self.gitAuthorEmails = gitAuthorEmails
        self.gitRepoDirs = gitRepoDirs
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let fallback = Self.defaults
        enabled = try values.decodeIfPresent(Bool.self, forKey: .enabled) ?? false
        maxPromptChars = try values.decodeIfPresent(Int.self, forKey: .maxPromptChars) ?? fallback.maxPromptChars
        maxReplyChars = try values.decodeIfPresent(Int.self, forKey: .maxReplyChars) ?? fallback.maxReplyChars
        windowDays = try values.decodeIfPresent(Int.self, forKey: .windowDays) ?? fallback.windowDays
        gitAuthorEmails = (try values.decodeIfPresent([String].self, forKey: .gitAuthorEmails) ?? [])
            .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }.filter { !$0.isEmpty }
        gitRepoDirs = try values.decodeIfPresent([String].self, forKey: .gitRepoDirs) ?? []
    }
}

/// A turn as sent to `POST /api/agent/turns`.
public struct Turn: Codable, Sendable, Equatable {
    public var agent: String
    public var sessionId: String
    public var turnKey: String
    public var project: String
    public var startedAt: String
    public var endedAt: String
    public var prompt: String
    public var reply: String
}

// ISO8601DateFormatter is documented as thread-safe.
nonisolated(unsafe) private let isoWithFraction: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
}()

nonisolated(unsafe) private let isoPlain: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
}()

func parseDate(_ text: String) -> Date? {
    isoWithFraction.date(from: text) ?? isoPlain.date(from: text)
}

/// Same shape as JavaScript's Date.prototype.toISOString: UTC with milliseconds.
func isoString(_ date: Date) -> String {
    let millis = (date.timeIntervalSince1970 * 1000).rounded(.down) / 1000
    return isoWithFraction.string(from: Date(timeIntervalSince1970: millis))
}

public func prepareTurns(_ turns: [RawTurn], limits: RemoteConfig, now: Date = Date()) -> [Turn] {
    let earliest = now.addingTimeInterval(-Double(limits.windowDays) * 86400)
    return turns.compactMap { turn in
        guard let startedAt = parseDate(turn.startedAt), startedAt >= earliest else { return nil }
        let endedAt = parseDate(turn.endedAt).map { max($0, startedAt) } ?? startedAt
        return Turn(
            agent: turn.agent,
            sessionId: utf16Prefix(turn.sessionId, 128),
            turnKey: utf16Prefix(turn.turnKey, 128),
            project: utf16Prefix(turn.cwd.isEmpty ? "" : URL(fileURLWithPath: turn.cwd).lastPathComponent, 80),
            startedAt: isoString(startedAt),
            endedAt: isoString(endedAt),
            prompt: clipMiddle(redact(turn.prompt), limits.maxPromptChars),
            reply: clipMiddle(redact(turn.reply), limits.maxReplyChars)
        )
    }
}

// MARK: - Sources

struct Source {
    var name: String
    var files: () -> [String]
    var parse: (String) throws -> ParseResult
}

func sources(_ config: CollectorConfig, limits: RemoteConfig) -> [Source] {
    var result: [Source] = []
    if FileManager.default.fileExists(atPath: config.claudeDir) {
        result.append(Source(name: "claude-code", files: { listClaudeFiles(config.claudeDir) }, parse: parseClaudeFile))
    }
    if FileManager.default.fileExists(atPath: config.codexDir) {
        result.append(Source(name: "codex", files: { listCodexFiles(config.codexDir) }, parse: parseCodexFile))
    }
    // Only the user's own commits are collected, so the Git source stays off until author emails are configured.
    let gitDirs = gitDirectories(limits.gitRepoDirs, home: config.home).filter(\.exists).map(\.path)
    if !limits.gitAuthorEmails.isEmpty && !gitDirs.isEmpty {
        result.append(Source(
            name: "git",
            files: {
                var seen = Set<String>()
                return gitDirs.flatMap { listGitRepos($0) }.filter { seen.insert($0).inserted }
            },
            parse: { headFile in
                do {
                    return ParseResult(turns: try readGitCommits(headFile: headFile, authorEmails: limits.gitAuthorEmails, windowDays: limits.windowDays))
                } catch GitLogError.failed {
                    return ParseResult(turns: [], skipped: 1)
                }
            }
        ))
    }
    return result
}

// MARK: - State

/// Size and modification time of every file already pushed, so unchanged files are not opened again.
struct CollectorState: Codable {
    struct FileMark: Codable, Equatable {
        var size: Int64
        var mtimeMs: Double
    }
    var files: [String: FileMark] = [:]

    static func load(from dir: String) -> CollectorState {
        let url = URL(fileURLWithPath: dir).appendingPathComponent("state.json")
        guard let data = try? Data(contentsOf: url) else { return CollectorState() }
        return (try? JSONDecoder().decode(CollectorState.self, from: data)) ?? CollectorState()
    }

    func save(to dir: String) throws {
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let url = URL(fileURLWithPath: dir).appendingPathComponent("state.json")
        try JSONEncoder().encode(self).write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
}

// MARK: - Scan

public struct SourceStats: Sendable, Equatable {
    public var agent: String
    public var files = 0
    public var changedFiles = 0
    public var sessions = 0
    public var turns = 0
    public var chars = 0
    public var unreadableLines = 0
    public var sent = 0
}

/// Returns per-source statistics. With `send`, changed files are parsed and pushed; unchanged files are not opened.
/// Without `send` (a dry run), every recent file is parsed and `collect` receives the prepared turns.
func scan(
    _ config: CollectorConfig, limits: RemoteConfig, state: inout CollectorState,
    send: (([Turn]) async throws -> Int)? = nil, collect: (([Turn]) -> Void)? = nil
) async throws -> [SourceStats] {
    let cutoffMs = (Date().timeIntervalSince1970 - Double(limits.windowDays) * 86400) * 1000
    var seen = Set<String>()
    var allStats: [SourceStats] = []
    for source in sources(config, limits: limits) {
        var stats = SourceStats(agent: source.name)
        for path in source.files() {
            guard let attributes = try? FileManager.default.attributesOfItem(atPath: path),
                  let modified = attributes[.modificationDate] as? Date else { continue }
            let mark = CollectorState.FileMark(
                size: (attributes[.size] as? NSNumber)?.int64Value ?? 0, mtimeMs: modified.timeIntervalSince1970 * 1000
            )
            if mark.mtimeMs < cutoffMs { continue }
            stats.files += 1
            seen.insert(path)
            if send != nil, state.files[path] == mark { continue }
            stats.changedFiles += 1
            let parsed = try source.parse(path)
            let prepared = prepareTurns(parsed.turns, limits: limits)
            stats.unreadableLines += parsed.skipped
            stats.turns += prepared.count
            stats.chars += prepared.reduce(0) { $0 + $1.prompt.utf16.count + $1.reply.utf16.count }
            if !prepared.isEmpty { stats.sessions += 1 }
            collect?(prepared)
            if let send {
                for offset in stride(from: 0, to: prepared.count, by: batchSize) {
                    stats.sent += try await send(Array(prepared[offset..<min(offset + batchSize, prepared.count)]))
                }
                // Only remember the file once every batch went through, so a failed push is retried next round.
                state.files[path] = mark
            }
        }
        allStats.append(stats)
    }
    for path in state.files.keys where !seen.contains(path) { state.files[path] = nil }
    return allStats
}

private let batchSize = 100

/// Reads every recent file without contacting MyDays. Used by `mydays-collect --dry-run` and `--dump`.
public func dryRun(_ config: CollectorConfig, limits: RemoteConfig = .defaults) async throws -> (stats: [SourceStats], turns: [Turn]) {
    var state = CollectorState()
    var turns: [Turn] = []
    let stats = try await scan(config, limits: limits, state: &state, collect: { turns += $0 })
    return (stats, turns)
}

// MARK: - Git directory status

public struct GitDirStatus: Codable, Sendable, Equatable {
    public var path: String
    public var state: String
    public var repos: Int
}

public func gitDirStatus(_ config: CollectorConfig, limits: RemoteConfig) -> [GitDirStatus] {
    gitDirectories(limits.gitRepoDirs, home: config.home).prefix(20).map { dir in
        let state = !dir.exists ? "missing" : limits.gitAuthorEmails.isEmpty ? "no-emails" : "ok"
        return GitDirStatus(path: utf16Prefix(dir.configuredPath, 300), state: state, repos: dir.exists ? listGitRepos(dir.path).count : 0)
    }
}

// MARK: - One round

public enum SyncOutcome: Sendable, Equatable {
    case synced(SyncSummary)
    /// The Agent digest feature is off in MyDays; no session file was read.
    case disabled
    case noToken
    case tokenInvalid
    case unreachable(String)
    case failed(String)
}

public struct SyncSummary: Sendable, Equatable {
    public var sentByAgent: [String: Int]
    public var gitDirs: [GitDirStatus]
    public var sent: Int { sentByAgent.values.reduce(0, +) }
}

public struct Collector: Sendable {
    public var config: CollectorConfig

    public init(config: CollectorConfig) {
        self.config = config
    }

    /// Fetches settings from MyDays, pushes every changed file and reports which Git directories were found.
    public func runOnce() async -> SyncOutcome {
        if config.token.isEmpty { return .noToken }
        let api = AgentAPI(baseURL: config.serverURL, token: config.token)
        let remote: RemoteConfig
        do {
            remote = try await api.config()
        } catch let error as APIError where error.code == "AGENT_TOKEN_INVALID" || error.code == "AGENT_SCOPE_FORBIDDEN" {
            return .tokenInvalid
        } catch {
            return .unreachable(describe(error))
        }
        // While the feature is off, no session file is opened at all.
        if !remote.enabled { return .disabled }
        var state = CollectorState.load(from: config.stateDir)
        defer { try? state.save(to: config.stateDir) }
        do {
            let stats = try await scan(config, limits: remote, state: &state, send: { try await api.send($0) })
            let gitDirs = gitDirStatus(config, limits: remote)
            try? await api.reportStatus(gitDirs)
            var sentByAgent: [String: Int] = [:]
            for stat in stats { sentByAgent[stat.agent] = stat.sent }
            return .synced(SyncSummary(sentByAgent: sentByAgent, gitDirs: gitDirs))
        } catch let error as APIError where error.code == "AGENT_DIGEST_DISABLED" {
            return .disabled
        } catch {
            return .failed(describe(error))
        }
    }

    private func describe(_ error: Error) -> String {
        if let error = error as? APIError { return error.code }
        if let error = error as? URLError { return "URLError \(error.code.rawValue)" }
        return String(describing: type(of: error))
    }
}
