import AppKit
import MyDaysCore
import Observation
import ServiceManagement

/// Owns the settings, the sync schedule and what the menu shows.
@MainActor @Observable
final class SyncModel {
    private(set) var settings = AppSettings.load()
    private(set) var isSyncing = false
    private(set) var lastOutcome: SyncOutcome?
    private(set) var lastSyncAt: Date?
    private(set) var todaySent: [String: Int] = [:]

    private var loop: Task<Void, Never>?
    private var wakeObserver: NSObjectProtocol?
    private let defaults = UserDefaults.standard

    init() {
        loadTodayCounts()
        wakeObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            // Give the network a moment to come back before the catch-up sync.
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(10))
                await self?.syncIfActive()
            }
        }
        restartLoop()
    }

    var isConfigured: Bool { settings.collectorConfig() != nil && !settings.token.isEmpty }

    func update(_ change: (inout AppSettings) -> Void) {
        var next = settings
        change(&next)
        guard next != settings else { return }
        let scheduleChanged = next.intervalMinutes != settings.intervalMinutes || next.paused != settings.paused
            || next.serverURL != settings.serverURL || next.token != settings.token
        settings = next
        try? settings.save()
        if scheduleChanged { restartLoop() }
    }

    func syncNow() async {
        guard !isSyncing else { return }
        guard let config = settings.collectorConfig() else {
            lastOutcome = .unreachable("服务器地址无效")
            return
        }
        isSyncing = true
        defer { isSyncing = false }
        // File reads and parsing run off the main thread.
        let outcome = await Task.detached { await Collector(config: config).runOnce() }.value
        lastOutcome = outcome
        lastSyncAt = Date()
        if case .synced(let summary) = outcome { addToToday(summary.sentByAgent) }
    }

    private func syncIfActive() async {
        if !settings.paused { await syncNow() }
    }

    private func restartLoop() {
        loop?.cancel()
        let interval = Duration.seconds(max(1, settings.intervalMinutes) * 60)
        loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.syncIfActive()
                try? await Task.sleep(for: interval)
            }
        }
    }

    // MARK: Today's counts

    private static let dayFormat = Date.ISO8601FormatStyle(timeZone: .current).year().month().day()

    private func loadTodayCounts() {
        let today = Date().formatted(Self.dayFormat)
        todaySent = defaults.string(forKey: "todayDate") == today ? (defaults.dictionary(forKey: "todaySent") as? [String: Int] ?? [:]) : [:]
    }

    private func addToToday(_ sent: [String: Int]) {
        loadTodayCounts()
        for (agent, count) in sent where count > 0 { todaySent[agent, default: 0] += count }
        defaults.set(Date().formatted(Self.dayFormat), forKey: "todayDate")
        defaults.set(todaySent, forKey: "todaySent")
    }

    // MARK: Launch at login

    var launchesAtLogin: Bool { SMAppService.mainApp.status == .enabled }

    func setLaunchAtLogin(_ enabled: Bool) throws {
        if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
    }
}
