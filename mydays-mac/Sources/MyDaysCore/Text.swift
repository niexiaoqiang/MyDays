import Foundation

// Lengths follow JavaScript's String.length (UTF-16 code units), because MyDays validates limits that way.
// Word boundaries are spelled as ASCII lookarounds: ICU's \b treats CJK characters as word characters, JavaScript's does not.

private let redactions: [NSRegularExpression] = [
    #"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)"#,
    #"(?<![A-Za-z0-9_])(?:sk-ant-|sk-|ghp_|gho_|ghu_|ghs_|github_pat_|glpat-|xox[abprs]-|mdk_)[A-Za-z0-9_\-]{16,}"#,
    #"(?<![A-Za-z0-9_])AKIA[0-9A-Z]{16}(?![A-Za-z0-9_])"#,
    #"(?<![A-Za-z0-9_])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"#,
    #"(?i)(?<![A-Za-z0-9_])Bearer\s+[A-Za-z0-9._~+/=-]{16,}"#,
].map { try! NSRegularExpression(pattern: $0) }

private let assignmentRedaction = try! NSRegularExpression(
    pattern: #"(?i)((?:api[_-]?key|token|secret|password|passwd|密码|密钥)["']?\s*[:=：]\s*["']?)([^\s"',;，。]{8,})"#
)

/// Best-effort only: pattern matching cannot recognize every secret.
public func redact(_ text: String) -> String {
    var result = text
    for pattern in redactions {
        result = pattern.stringByReplacingMatches(in: result, range: NSRange(result.startIndex..., in: result), withTemplate: "[已隐藏]")
    }
    return assignmentRedaction.stringByReplacingMatches(in: result, range: NSRange(result.startIndex..., in: result), withTemplate: "$1[已隐藏]")
}

/// Keeps the start and the end of a long text, never splitting a character.
public func clipMiddle(_ text: String, _ limit: Int) -> String {
    if text.utf16.count <= limit { return text }
    let budget = limit - 3
    let headBudget = (budget + 1) / 2
    return "\(utf16Prefix(text, headBudget))[…]\(utf16Suffix(text, budget - headBudget))"
}

public func utf16Prefix(_ text: String, _ limit: Int) -> String {
    var used = 0
    var end = text.startIndex
    for index in text.indices {
        let width = text[index].utf16.count
        if used + width > limit { break }
        used += width
        end = text.index(after: index)
    }
    return String(text[..<end])
}

private func utf16Suffix(_ text: String, _ limit: Int) -> String {
    var used = 0
    var start = text.endIndex
    while start > text.startIndex {
        let previous = text.index(before: start)
        let width = text[previous].utf16.count
        if used + width > limit { break }
        used += width
        start = previous
    }
    return String(text[start...])
}
