import AppKit
import MyDaysCore
import SwiftUI

@main
struct MyDaysBarApp: App {
    @State private var model = SyncModel()

    var body: some Scene {
        MenuBarExtra {
            MenuContent(model: model)
        } label: {
            Image(systemName: model.statusSymbol)
        }
        // A plain window rather than a Settings scene: SettingsLink does not reliably open or front it from a menu bar app.
        Window("MyDays 设置", id: settingsWindowID) {
            SettingsView(model: model)
        }
        .windowResizability(.contentSize)
        .defaultLaunchBehavior(.suppressed)
    }
}

let settingsWindowID = "settings"

extension SyncModel {
    var statusSymbol: String {
        if isSyncing { return "arrow.triangle.2.circlepath" }
        if settings.paused { return "pause.circle" }
        switch lastOutcome {
        case .synced, nil: return isConfigured ? "calendar.day.timeline.left" : "calendar.badge.exclamationmark"
        case .disabled: return "moon.zzz"
        case .noToken, .tokenInvalid, .unreachable, .failed: return "exclamationmark.triangle"
        }
    }

    var statusText: String {
        if isSyncing { return "正在同步…" }
        if !isConfigured { return "还没有设置令牌" }
        let time = lastSyncAt.map { $0.formatted(date: .omitted, time: .shortened) } ?? ""
        switch lastOutcome {
        case nil: return settings.paused ? "已暂停" : "等待首次同步"
        case .synced: return settings.paused ? "已暂停 · 上次同步 \(time)" : "已同步 · \(time)"
        case .disabled: return "MyDays 里还没开启 Agent 工作汇总"
        case .noToken: return "还没有设置令牌"
        case .tokenInvalid: return "令牌无效或已吊销"
        case .unreachable(let reason): return "连不上 MyDays（\(reason)）"
        case .failed(let reason): return "推送失败，下次重试（\(reason)）"
        }
    }

    var todayText: String {
        let labels = [("claude-code", "Claude"), ("codex", "Codex"), ("git", "Git")]
        let parts = labels.compactMap { key, label in todaySent[key].map { "\(label) \($0)" } }
        let total = todaySent.values.reduce(0, +)
        return parts.isEmpty ? "今天还没有推送新内容" : "今天推送 \(total) 条：\(parts.joined(separator: " · "))"
    }
}

struct MenuContent: View {
    let model: SyncModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Text(model.statusText)
        Text(model.todayText)
        Divider()
        Button("立即同步") { Task { await model.syncNow() } }
            .keyboardShortcut("r")
            .disabled(model.isSyncing || !model.isConfigured)
        Button("打开 MyDays") {
            if let url = URL(string: model.settings.serverURL) { NSWorkspace.shared.open(url) }
        }
        .keyboardShortcut("o")
        Toggle("暂停采集", isOn: Binding(get: { model.settings.paused }, set: { value in model.update { $0.paused = value } }))
        Divider()
        Button("设置…") {
            // An accessory app cannot bring its windows forward; become a regular app while the window is open.
            NSApp.setActivationPolicy(.regular)
            openWindow(id: settingsWindowID)
            NSApp.activate(ignoringOtherApps: true)
        }
        .keyboardShortcut(",")
        Button("退出 MyDaysBar") { NSApp.terminate(nil) }
            .keyboardShortcut("q")
    }
}
