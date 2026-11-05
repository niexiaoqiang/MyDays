import Foundation

/// One human prompt and the agent's last text answer to it, as read from a session file (before trimming).
public struct RawTurn: Sendable {
    public var agent: String
    public var sessionId: String
    public var turnKey: String
    public var cwd: String
    public var startedAt: String
    public var endedAt: String
    public var prompt: String
    public var reply: String
}

public struct ParseResult: Sendable {
    public var turns: [RawTurn] = []
    public var skipped = 0
}

typealias JSON = [String: Any]

/// Yields each line's JSON object, or nil for a line that is not a JSON object.
func readJSONLines(_ path: String) -> [JSON?] {
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: path), options: .mappedIfSafe) else { return [] }
    var entries: [JSON?] = []
    for line in data.split(separator: UInt8(ascii: "\n"), omittingEmptySubsequences: true) {
        let isBlank = line.allSatisfy { $0 == 0x20 || $0 == 0x09 || $0 == 0x0D }
        if isBlank { continue }
        entries.append((try? JSONSerialization.jsonObject(with: Data(line))) as? JSON)
    }
    return entries
}

private let textBlockTypes: Set<String> = ["text", "input_text", "output_text"]

func textOfBlocks(_ content: Any?) -> String {
    if let text = content as? String { return text }
    guard let blocks = content as? [Any] else { return "" }
    let objects = blocks.map { $0 as? JSON }
    if objects.contains(where: { $0?["type"] as? String == "tool_result" }) { return "" }
    return objects.compactMap { block -> String? in
        guard let block, let type = block["type"] as? String, textBlockTypes.contains(type) else { return nil }
        return block["text"] as? String
    }.joined(separator: "\n")
}

private let commandName = try! NSRegularExpression(pattern: #"<command-name>([^<]*)</command-name>"#)
private let commandArgs = try! NSRegularExpression(pattern: #"<command-args>([\s\S]*?)</command-args>"#)

private func firstGroup(_ regex: NSRegularExpression, _ text: String) -> String? {
    guard let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
          let range = Range(match.range(at: 1), in: text) else { return nil }
    return String(text[range])
}

/// Slash commands arrive wrapped in tags; keep the command and its arguments, drop every other injected wrapper.
func humanPromptText(_ raw: String) -> String {
    let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.isEmpty || text.hasPrefix("[Request interrupted") { return "" }
    if !text.hasPrefix("<") { return text }
    let command = firstGroup(commandName, text)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let args = firstGroup(commandArgs, text)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return !command.isEmpty && !args.isEmpty ? "\(command) \(args)" : ""
}

/// Mirrors JavaScript's String(value) for the scalar values session files use as ids.
private func stringValue(_ value: Any?) -> String? {
    switch value {
    case let string as String: return string
    case let number as NSNumber: return number.stringValue
    default: return nil
    }
}

private func nonEmpty(_ value: Any?) -> String? {
    guard let string = stringValue(value), !string.isEmpty else { return nil }
    return string
}

public func parseClaudeFile(_ path: String) -> ParseResult {
    var result = ParseResult()
    var current: Int? = nil
    for entry in readJSONLines(path) {
        guard let entry else { result.skipped += 1; continue }
        if entry["isSidechain"] as? Bool == true || entry["isMeta"] as? Bool == true { continue }
        let message = entry["message"] as? JSON
        if entry["type"] as? String == "user" {
            if let kind = (entry["origin"] as? JSON)?["kind"] as? String, !kind.isEmpty, kind != "human" { continue }
            let prompt = humanPromptText(textOfBlocks(message?["content"]))
            guard !prompt.isEmpty, let timestamp = nonEmpty(entry["timestamp"]), let sessionId = nonEmpty(entry["sessionId"]) else { continue }
            result.turns.append(RawTurn(
                agent: "claude-code", sessionId: sessionId, turnKey: stringValue(entry["uuid"]) ?? timestamp,
                cwd: entry["cwd"] as? String ?? "", startedAt: timestamp, endedAt: timestamp, prompt: prompt, reply: ""
            ))
            current = result.turns.count - 1
        } else if entry["type"] as? String == "assistant", let index = current {
            let text = textOfBlocks(message?["content"]).trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                result.turns[index].reply = text
                if let timestamp = nonEmpty(entry["timestamp"]) { result.turns[index].endedAt = timestamp }
            }
        }
    }
    return result
}

public func parseCodexFile(_ path: String) -> ParseResult {
    var result = ParseResult()
    var current: Int? = nil
    var sessionId = ""
    var cwd = ""
    var first = true
    for entry in readJSONLines(path) {
        guard let entry else { result.skipped += 1; continue }
        let payload = entry["payload"] as? JSON ?? [:]
        let type = entry["type"] as? String
        let payloadType = payload["type"] as? String
        if first {
            first = false
            // Sub-agent threads carry an object here and programmatic runs use "exec"; only interactive sessions count.
            guard type == "session_meta", let source = payload["source"] as? String, source != "exec" else {
                return ParseResult(turns: [], skipped: result.skipped)
            }
            sessionId = stringValue(payload["id"]) ?? stringValue(payload["session_id"])
                ?? URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
            cwd = payload["cwd"] as? String ?? ""
            continue
        }
        if type == "turn_context", let turnCwd = payload["cwd"] as? String { cwd = turnCwd }
        // Desktop sessions record prompts as response items; CLI sessions also emit user_message events. Accept both without duplicating.
        let isUserItem = type == "response_item" && payloadType == "message" && payload["role"] as? String == "user"
        let isUserEvent = type == "event_msg" && payloadType == "user_message"
        if isUserItem || isUserEvent {
            let prompt = humanPromptText(isUserItem ? textOfBlocks(payload["content"]) : stringValue(payload["message"]) ?? "")
            guard !prompt.isEmpty, let timestamp = nonEmpty(entry["timestamp"]) else { continue }
            if let index = current, result.turns[index].prompt == prompt { continue }
            result.turns.append(RawTurn(
                agent: "codex", sessionId: sessionId, turnKey: timestamp, cwd: cwd,
                startedAt: timestamp, endedAt: timestamp, prompt: prompt, reply: ""
            ))
            current = result.turns.count - 1
            continue
        }
        guard let index = current else { continue }
        var reply = ""
        if type == "response_item" && payloadType == "message" && payload["role"] as? String == "assistant" {
            reply = textOfBlocks(payload["content"])
        } else if type == "event_msg" && payloadType == "agent_message" {
            reply = stringValue(payload["message"]) ?? ""
        } else if type == "event_msg" && payloadType == "task_complete" {
            reply = stringValue(payload["last_agent_message"]) ?? ""
        }
        let trimmed = reply.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            result.turns[index].reply = trimmed
            if let timestamp = nonEmpty(entry["timestamp"]) { result.turns[index].endedAt = timestamp }
        }
    }
    return result
}

func listClaudeFiles(_ dir: String) -> [String] {
    var files: [String] = []
    for project in directoryEntries(dir) where project.isDirectory {
        for entry in directoryEntries(project.path) where !entry.isDirectory && entry.name.hasSuffix(".jsonl") {
            files.append(entry.path)
        }
    }
    return files
}

/// Codex stores sessions under YYYY/MM/DD by start date. Long-running threads live in old directories, so walk the
/// whole tree and let the caller filter by modification time.
func listCodexFiles(_ dir: String, depth: Int = 0) -> [String] {
    var files: [String] = []
    for entry in directoryEntries(dir) {
        if entry.isDirectory && depth < 3 { files += listCodexFiles(entry.path, depth: depth + 1) }
        else if !entry.isDirectory && entry.name.hasSuffix(".jsonl") { files.append(entry.path) }
    }
    return files
}

struct DirectoryEntry {
    var name: String
    var path: String
    var isDirectory: Bool
}

/// Like readdir with file types: symbolic links are neither files nor directories here, matching the Node collector.
func directoryEntries(_ dir: String) -> [DirectoryEntry] {
    let url = URL(fileURLWithPath: dir)
    guard let urls = try? FileManager.default.contentsOfDirectory(
        at: url, includingPropertiesForKeys: [.isDirectoryKey, .isRegularFileKey, .isSymbolicLinkKey]
    ) else { return [] }
    return urls.compactMap { child in
        guard let values = try? child.resourceValues(forKeys: [.isDirectoryKey, .isRegularFileKey, .isSymbolicLinkKey]),
              values.isSymbolicLink != true else { return nil }
        // Built from `dir` rather than child.path, which may resolve /var to /private/var and change state keys.
        let name = child.lastPathComponent
        let path = (dir as NSString).appendingPathComponent(name)
        if values.isDirectory == true { return DirectoryEntry(name: name, path: path, isDirectory: true) }
        if values.isRegularFile == true { return DirectoryEntry(name: name, path: path, isDirectory: false) }
        return nil
    }.sorted { $0.name < $1.name }
}
