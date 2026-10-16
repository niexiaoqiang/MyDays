import AppKit
import MyDaysCore
import SwiftUI

struct SettingsView: View {
    let model: SyncModel
    @State private var serverURL = ""
    @State private var token = ""
    @State private var intervalMinutes = 15
    @State private var launchAtLogin = false
    @State private var launchError: String?

    var body: some View {
        Form {
            Section {
                TextField("服务器地址", text: $serverURL, prompt: Text("http://localhost:4173"))
                SecureField("采集令牌", text: $token, prompt: Text("mdk_…"))
                Text("在 MyDays「设置 → 连接与令牌」里创建一个“采集”令牌，粘贴到这里。")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section {
                Picker("同步间隔", selection: $intervalMinutes) {
                    ForEach([5, 15, 30, 60], id: \.self) { Text("\($0) 分钟").tag($0) }
                }
                Toggle("登录时自动启动", isOn: $launchAtLogin)
                    .onChange(of: launchAtLogin) { _, enabled in
                        guard enabled != model.launchesAtLogin else { return }
                        do {
                            try model.setLaunchAtLogin(enabled)
                            launchError = nil
                        } catch {
                            launchError = error.localizedDescription
                            launchAtLogin = model.launchesAtLogin
                        }
                    }
                if let launchError { Text(launchError).font(.caption).foregroundStyle(.red) }
            }
            Section {
                HStack {
                    Text(model.statusText).foregroundStyle(.secondary)
                    Spacer()
                    Button("保存并同步") {
                        model.update {
                            $0.serverURL = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
                            $0.token = token.trimmingCharacters(in: .whitespacesAndNewlines)
                            $0.intervalMinutes = intervalMinutes
                        }
                        Task { await model.syncNow() }
                    }
                    .keyboardShortcut(.defaultAction)
                    .disabled(model.isSyncing)
                }
                if case .synced(let summary) = model.lastOutcome, !summary.gitDirs.isEmpty {
                    ForEach(summary.gitDirs, id: \.path) { dir in
                        LabeledContent(dir.path, value: gitStateText(dir))
                    }
                }
            } header: {
                Text("状态")
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .onAppear {
            serverURL = model.settings.serverURL
            token = model.settings.token
            intervalMinutes = model.settings.intervalMinutes
            launchAtLogin = model.launchesAtLogin
            // A menu bar app is never frontmost on its own; bring the window forward.
            NSApp.activate()
        }
    }

    private func gitStateText(_ dir: GitDirStatus) -> String {
        switch dir.state {
        case "ok": return "\(dir.repos) 个仓库"
        case "no-emails": return "未设置作者邮箱"
        default: return "目录不存在"
        }
    }
}
