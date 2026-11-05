import Foundation

private let skippedDirectories: Set<String> = ["node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "Library"]

public struct GitDirectory: Sendable, Equatable {
    /// The directory as configured in MyDays settings, reported back unchanged.
    public var configuredPath: String
    public var path: String
    public var exists: Bool
}

public func expandHome(_ path: String, home: String = NSHomeDirectory()) -> String {
    if path == "~" { return home }
    if path.hasPrefix("~/") { return home + path.dropFirst(1) }
    return path
}

func gitDirectories(_ configured: [String], home: String = NSHomeDirectory()) -> [GitDirectory] {
    configured.map { configuredPath in
        let path = expandHome(configuredPath, home: home)
        var isDirectory: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory) && isDirectory.boolValue
        return GitDirectory(configuredPath: configuredPath, path: path, exists: exists)
    }
}

/// A repository is recognised by .git/logs/HEAD, whose modification time changes whenever HEAD moves (commit, checkout,
/// pull). Returning that file lets the scan skip repositories that have not changed since the last round.
func listGitRepos(_ dir: String, depth: Int = 0) -> [String] {
    let head = (dir as NSString).appendingPathComponent(".git/logs/HEAD")
    if FileManager.default.fileExists(atPath: head) { return [head] }
    if depth >= 3 { return [] }
    return directoryEntries(dir)
        .filter { $0.isDirectory && !$0.name.hasPrefix(".") && !skippedDirectories.contains($0.name) }
        .flatMap { listGitRepos($0.path, depth: depth + 1) }
}

public func parseGitLog(_ output: String, repoPath: String) -> [RawTurn] {
    let statPattern = try! NSRegularExpression(pattern: #"(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?"#)
    let statTail = try! NSRegularExpression(pattern: #"\n\s*\d+ files? changed[\s\S]*$"#)
    let repoName = URL(fileURLWithPath: repoPath).lastPathComponent
    var turns: [RawTurn] = []
    for record in output.components(separatedBy: "\u{1e}") {
        if record.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
        let fields = String(record.drop { $0 == "\n" }).components(separatedBy: "\u{1f}")
        guard fields.count >= 3, !fields[0].isEmpty, !fields[1].isEmpty, !fields[2].isEmpty else { continue }
        let rest = fields.count > 3 ? fields[3] : ""
        let restRange = NSRange(rest.startIndex..., in: rest)
        var size = ""
        if let stat = statPattern.firstMatch(in: rest, range: restRange) {
            func group(_ index: Int) -> String {
                Range(stat.range(at: index), in: rest).map { String(rest[$0]) } ?? "0"
            }
            size = "（\(group(1)) 个文件，+\(group(2)) -\(group(3))）"
        }
        let body = statTail.stringByReplacingMatches(in: rest, range: restRange, withTemplate: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let date = fields[1].trimmingCharacters(in: .whitespacesAndNewlines)
        turns.append(RawTurn(
            agent: "git", sessionId: "git:\(repoName)", turnKey: fields[0].trimmingCharacters(in: .whitespacesAndNewlines),
            cwd: repoPath, startedAt: date, endedAt: date, prompt: fields[2].trimmingCharacters(in: .whitespacesAndNewlines),
            reply: "\(body)\(!body.isEmpty && !size.isEmpty ? " " : "")\(size)".trimmingCharacters(in: .whitespacesAndNewlines)
        ))
    }
    return turns
}

private func escapeGitPattern(_ value: String) -> String {
    let special = Set(".*+?^${}()|[]\\")
    return value.map { special.contains($0) ? "\\\($0)" : String($0) }.joined()
}

/// Apps started from Finder get a minimal PATH, so look for Git where it is usually installed.
let gitExecutable: String? = ["/opt/homebrew/bin/git", "/usr/local/bin/git", "/usr/bin/git"]
    .first { FileManager.default.isExecutableFile(atPath: $0) }

enum GitLogError: Error { case unavailable, failed }

/// Reads the user's own commits on every branch within the window. `headFile` is the repository's .git/logs/HEAD.
func readGitCommits(headFile: String, authorEmails: [String], windowDays: Int, now: Date = Date()) throws -> [RawTurn] {
    guard let gitExecutable else { throw GitLogError.unavailable }
    let repoPath = URL(fileURLWithPath: headFile).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().path
    let since = isoString(now.addingTimeInterval(-Double(windowDays) * 86400))
    let process = Process()
    process.executableURL = URL(fileURLWithPath: gitExecutable)
    process.arguments = ["-c", "safe.directory=*", "-C", repoPath, "log", "--all", "--no-merges", "--since=\(since)"]
        + authorEmails.map { "--author=<\(escapeGitPattern($0))>" }
        + ["--format=%x1e%H%x1f%aI%x1f%s%x1f%b", "--shortstat"]
    let output = Pipe()
    process.standardOutput = output
    process.standardError = FileHandle.nullDevice
    process.standardInput = FileHandle.nullDevice
    do { try process.run() } catch { throw GitLogError.unavailable }
    let timeout = DispatchWorkItem { process.terminate() }
    DispatchQueue.global().asyncAfter(deadline: .now() + 20, execute: timeout)
    let data = output.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    timeout.cancel()
    guard process.terminationStatus == 0 else { throw GitLogError.failed }
    return parseGitLog(String(decoding: data, as: UTF8.self), repoPath: repoPath)
}
