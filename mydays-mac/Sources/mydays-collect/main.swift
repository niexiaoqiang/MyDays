import Foundation
import MyDaysCore

// Usage:
//   mydays-collect --dry-run   print per-source statistics without contacting MyDays
//   mydays-collect --dump      print the turns a sync would send, as JSON (for comparing with the Node collector)
//   mydays-collect --once      sync once; reads MYDAYS_URL and MYDAYS_TOKEN (or the menu bar app's saved settings)
// CLAUDE_PROJECTS_DIR and CODEX_SESSIONS_DIR override the session directories; GIT_REPO_DIRS and GIT_AUTHOR_EMAILS
// (comma separated) feed the Git source in dry runs, where MyDays settings are not fetched.

let env = ProcessInfo.processInfo.environment
let arguments = Set(CommandLine.arguments.dropFirst())
let settings = AppSettings.load()

func list(_ name: String) -> [String] {
    (env[name] ?? "").split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
}

var config = CollectorConfig(
    serverURL: URL(string: env["MYDAYS_URL"] ?? settings.serverURL) ?? URL(string: "http://localhost:4173")!,
    token: env["MYDAYS_TOKEN"] ?? settings.token,
    stateDir: AppSettings.supportDirectory.appendingPathComponent("collector").path
)
if let dir = env["CLAUDE_PROJECTS_DIR"] { config.claudeDir = dir }
if let dir = env["CODEX_SESSIONS_DIR"] { config.codexDir = dir }

if arguments.contains("--dry-run") || arguments.contains("--dump") {
    var limits = RemoteConfig.defaults
    limits.gitRepoDirs = list("GIT_REPO_DIRS")
    limits.gitAuthorEmails = list("GIT_AUTHOR_EMAILS").map { $0.lowercased() }
    let (stats, turns) = try await dryRun(config, limits: limits)
    if arguments.contains("--dump") {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        print(String(decoding: try encoder.encode(turns), as: UTF8.self))
    } else {
        for stat in stats {
            print("\(stat.agent): \(stat.files) recent files, \(stat.sessions) sessions with human turns, \(stat.turns) turns, \(stat.chars) chars after trimming, \(stat.unreadableLines) unreadable lines")
        }
    }
    exit(0)
}

if arguments.contains("--once") {
    let outcome = await Collector(config: config).runOnce()
    print(outcome)
    if case .synced = outcome { exit(0) }
    exit(outcome == .disabled ? 0 : 1)
}

print("usage: mydays-collect --once | --dry-run | --dump")
exit(2)
