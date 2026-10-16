import Foundation
import Testing
@testable import MyDaysCore

// Mirrors the fixtures in MyDays' tests/collector_test.cjs so both collectors behave the same.

private func at(_ minutesAgo: Double) -> String { isoString(Date().addingTimeInterval(-minutesAgo * 60)) }

private func writeLines(_ path: String, _ entries: [Any]) throws {
    try FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
    let lines = try entries.map { entry -> String in
        if let line = entry as? String { return line }
        return String(decoding: try JSONSerialization.data(withJSONObject: entry), as: UTF8.self)
    }
    try (lines.joined(separator: "\n") + "\n").write(toFile: path, atomically: true, encoding: .utf8)
}

private func temporaryDirectory() throws -> String {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("mydays-mac-\(UUID().uuidString)").path
    try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    return dir
}

@Test func redactsSecretsAndClipsTheMiddle() {
    #expect(redact("ghp_abcdefghijklmnopqrstuvwxyz0123 和 password: hunter2hunter2") == "[已隐藏] 和 password: [已隐藏]")
    #expect(redact("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY----- 之后") == "[已隐藏] 之后")
    #expect(redact("普通的一句话，没有密钥") == "普通的一句话，没有密钥")
    #expect(redact("令牌sk-ant-abcdefghijklmnopqrstuvwxyz") == "令牌[已隐藏]", "CJK text right before a key still counts as a boundary")
    #expect(clipMiddle(String(repeating: "a", count: 50), 20).utf16.count == 20)
    #expect(clipMiddle("短文本", 20) == "短文本")
    #expect(clipMiddle(String(repeating: "😀", count: 30), 21).utf16.count <= 21, "never splits a surrogate pair")
}

@Test func parsesClaudeSessions() throws {
    let file = try temporaryDirectory() + "/shop/session-a.jsonl"
    func user(_ uuid: String, _ minutesAgo: Double, _ content: Any, _ extra: [String: Any] = [:]) -> [String: Any] {
        ["type": "user", "uuid": uuid, "sessionId": "session-a", "cwd": "/Users/me/work/shop", "timestamp": at(minutesAgo),
         "origin": ["kind": "human"], "message": ["role": "user", "content": content]].merging(extra) { $1 }
    }
    func assistant(_ minutesAgo: Double, _ content: Any) -> [String: Any] {
        ["type": "assistant", "sessionId": "session-a", "timestamp": at(minutesAgo), "message": ["role": "assistant", "content": content]]
    }
    try writeLines(file, [
        user("u-old", 60 * 24 * 20, "二十天前的提问不应出现"),
        user("u1", 60, "帮我修复购物车金额计算，api_key=supersecretvalue123"),
        assistant(59, [["type": "thinking", "thinking": "内部思考不应出现"]]),
        assistant(58, [["type": "text", "text": "先看一下代码。"], ["type": "tool_use", "id": "t1", "name": "Read", "input": [:]]]),
        user("u1-tool", 57, [["type": "tool_result", "tool_use_id": "t1", "content": "工具输出不应出现"]]),
        assistant(56, [["type": "text", "text": "已修复购物车金额计算并通过测试。"]]),
        user("u-side", 55, "子代理的提问不应出现", ["isSidechain": true]),
        user("u-meta", 54, "元信息不应出现", ["isMeta": true]),
        user("u-task", 53, "定时任务通知不应出现", ["origin": ["kind": "task-notification"]]),
        user("u-wrap", 52, "<system-reminder>系统注入不应出现</system-reminder>"),
        user("u-int", 51, "[Request interrupted by user]"),
        user("u2", 50, "<command-message>review</command-message>\n<command-name>/review</command-name>\n<command-args>检查支付模块</command-args>"),
        "this line is not json",
        assistant(49, [["type": "text", "text": String(repeating: "很长的答复", count: 400) + "结尾标记"]]),
        user("u3", 10, [["type": "text", "text": "再加一个优惠券功能"]]),
    ])
    let parsed = parseClaudeFile(file)
    #expect(parsed.skipped == 1)
    let turns = prepareTurns(parsed.turns, limits: .defaults)
    #expect(turns.map(\.turnKey) == ["u1", "u2", "u3"])
    #expect(turns[0].prompt == "帮我修复购物车金额计算，api_key=[已隐藏]")
    #expect(turns[0].reply == "已修复购物车金额计算并通过测试。")
    #expect(turns[0].project == "shop")
    #expect(turns[1].prompt == "/review 检查支付模块")
    #expect(turns[1].reply.utf16.count == 1500)
    #expect(turns[1].reply.hasSuffix("结尾标记"))
    #expect(turns[2].reply == "")
}

@Test func parsesCodexSessionsAndSkipsSubagents() throws {
    let dir = try temporaryDirectory()
    func meta(_ source: Any) -> [String: Any] {
        ["type": "session_meta", "timestamp": at(120), "payload": ["id": "codex-vscode", "cwd": "/Users/me/work/blog", "source": source]]
    }
    func item(_ role: String, _ minutesAgo: Double, _ text: String) -> [String: Any] {
        ["type": "response_item", "timestamp": at(minutesAgo),
         "payload": ["type": "message", "role": role, "content": [["type": role == "user" ? "input_text" : "output_text", "text": text]]]]
    }
    try writeLines(dir + "/2026/01/02/rollout-desktop.jsonl", [
        meta("vscode"),
        item("user", 40, "<environment_context>注入的环境信息不应出现</environment_context>"),
        item("user", 39, "给博客加上 RSS 输出"),
        ["type": "response_item", "timestamp": at(38), "payload": ["type": "function_call_output", "output": "命令输出不应出现"]],
        item("assistant", 37, "正在处理。"),
        ["type": "event_msg", "timestamp": at(36), "payload": ["type": "task_complete", "last_agent_message": "RSS 输出已完成，Bearer abcdefghijklmnopqrstuvwxyz012345 已配置。"]],
        ["type": "turn_context", "timestamp": at(30), "payload": ["cwd": "/Users/me/work/docs"]],
        item("user", 29, "更新部署文档"),
        ["type": "event_msg", "timestamp": at(29), "payload": ["type": "user_message", "message": "更新部署文档"]],
        ["type": "event_msg", "timestamp": at(28), "payload": ["type": "agent_message", "message": "部署文档已更新。"]],
    ])
    try writeLines(dir + "/2026/10/01/rollout-sub.jsonl", [meta(["subagent": ["other": "guardian"]]), item("user", 20, "子代理会话不应出现")])
    try writeLines(dir + "/2026/10/01/rollout-exec.jsonl", [meta("exec"), item("user", 20, "程序化调用不应出现")])
    let turns = listCodexFiles(dir).flatMap { prepareTurns(parseCodexFile($0).turns, limits: .defaults) }
    #expect(turns.map(\.prompt) == ["给博客加上 RSS 输出", "更新部署文档"])
    #expect(turns[0].reply == "RSS 输出已完成，[已隐藏] 已配置。")
    #expect(turns.map(\.project) == ["blog", "docs"])
    #expect(turns[1].reply == "部署文档已更新。")
}

@Test func parsesGitLog() {
    let output = "\u{1e}abc\u{1f}2026-10-16T10:00:00+08:00\u{1f}实现首页搜索\u{1f}顺带修复样式。\n\n 1 file changed, 1 insertion(+)\n"
    let turns = parseGitLog(output, repoPath: "/repos/webapp")
    #expect(turns.count == 1)
    #expect(turns[0].sessionId == "git:webapp")
    #expect(turns[0].reply == "顺带修复样式。 （1 个文件，+1 -0）")
    #expect(parseGitLog("\u{1e}abc\u{1f}2026-10-16T10:00:00+08:00\u{1f}只有标题\u{1f}\n", repoPath: "/repos/x").map(\.reply) == [""])
}

@Test func findsReposButSkipsDependencies() throws {
    let dir = try temporaryDirectory()
    for repo in ["group/webapp", "node_modules/dep", ".hidden/x"] {
        let logs = dir + "/\(repo)/.git/logs"
        try FileManager.default.createDirectory(atPath: logs, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: logs + "/HEAD", contents: Data())
    }
    #expect(listGitRepos(dir) == [dir + "/group/webapp/.git/logs/HEAD"])
    let status = gitDirStatus(CollectorConfig(serverURL: URL(string: "http://x")!, token: "", stateDir: dir, home: dir),
                              limits: RemoteConfig(enabled: true, maxPromptChars: 600, maxReplyChars: 1500, windowDays: 8,
                                                   gitAuthorEmails: [], gitRepoDirs: ["~", "~/missing"]))
    #expect(status == [GitDirStatus(path: "~", state: "no-emails", repos: 1), GitDirStatus(path: "~/missing", state: "missing", repos: 0)])
}
