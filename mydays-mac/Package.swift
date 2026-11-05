// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MyDaysBar",
    platforms: [.macOS(.v15)],
    products: [
        .executable(name: "MyDaysBar", targets: ["MyDaysBar"]),
        .executable(name: "mydays-collect", targets: ["mydays-collect"]),
    ],
    targets: [
        // Reads local agent sessions and Git history and pushes trimmed turns to MyDays. No UI code.
        .target(name: "MyDaysCore"),
        // The menu bar app.
        .executableTarget(name: "MyDaysBar", dependencies: ["MyDaysCore"]),
        // Command-line entry for one-off syncs and for comparing output with the Node collector.
        .executableTarget(name: "mydays-collect", dependencies: ["MyDaysCore"]),
        .testTarget(name: "MyDaysCoreTests", dependencies: ["MyDaysCore"]),
    ]
)
