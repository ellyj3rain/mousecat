using System.Text.Json;
using System.Diagnostics;

namespace Mousecat.Desktop;

internal sealed record DesktopSettings(string RepositoryRoot, string NodePath, string ConfigPath, int Port = 4317)
{
    internal static readonly string DataRoot = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Mousecat", "Desktop");
    internal Uri Origin => new($"http://127.0.0.1:{Port}/");
    internal string StatePath { get; private init; } = "";

    internal static DesktopSettings Load(string path)
    {
        var value = JsonSerializer.Deserialize<DesktopSettings>(File.ReadAllText(path))
            ?? throw new InvalidDataException("Desktop settings are missing.");
        if (value.Port < 1 || value.Port > 65535 || !Path.IsPathFullyQualified(value.RepositoryRoot)
            || !Path.IsPathFullyQualified(value.NodePath) || !Path.IsPathFullyQualified(value.ConfigPath)
            || !File.Exists(value.NodePath) || !File.Exists(value.ConfigPath)
            || !File.Exists(Path.Combine(value.RepositoryRoot, "src", "cli.mjs")))
            throw new InvalidDataException("The Mousecat installation paths are unavailable. Run the desktop installer again.");
        using var config = JsonDocument.Parse(File.ReadAllText(value.ConfigPath).TrimStart('\uFEFF'));
        if (!config.RootElement.TryGetProperty("state", out var state)
            || !state.TryGetProperty("enabled", out var enabled) || enabled.ValueKind != JsonValueKind.True)
            throw new InvalidDataException("Enable local state in the selected Mousecat configuration to retain questions.");
        var statePath = state.TryGetProperty("path", out var stateFile) ? stateFile.GetString() : ".mousecat/state.json";
        if (string.IsNullOrWhiteSpace(statePath)) throw new InvalidDataException("Local state needs a file path.");
        return value with { StatePath = Path.GetFullPath(statePath, value.RepositoryRoot) };
    }

    internal bool Owns(Uri uri) => uri.Scheme == Origin.Scheme && uri.Host == Origin.Host
        && uri.Port == Origin.Port && string.IsNullOrEmpty(uri.UserInfo);

    internal bool MatchesServiceRecord(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            bool SameLocation(string? actual, string expected) => !string.IsNullOrWhiteSpace(actual)
                && Path.IsPathFullyQualified(actual)
                && string.Equals(Path.GetFullPath(actual), Path.GetFullPath(expected), StringComparison.OrdinalIgnoreCase);
            bool SamePath(string key, string expected) => root.TryGetProperty(key, out var field)
                && SameLocation(field.GetString(), expected);
            if (!SamePath("configPath", ConfigPath) || !SamePath("workingDirectory", RepositoryRoot)
                || !SamePath("runnerPath", Path.Combine(RepositoryRoot, "src", "service", "runner.mjs"))
                || !root.TryGetProperty("schema", out var schema) || schema.GetString() != "mousecat.user-service-record/1"
                || !root.TryGetProperty("serviceId", out var service) || service.GetString() != "mousecat-operator"
                || !root.TryGetProperty("port", out var port) || port.GetInt32() != Port
                || !root.TryGetProperty("persistence", out var persistence)
                || !persistence.TryGetProperty("enabled", out var enabled) || enabled.ValueKind != JsonValueKind.True
                || !persistence.TryGetProperty("path", out var path)
                || !SameLocation(path.GetString(), StatePath)
                || !root.TryGetProperty("pid", out var pid)) return false;
            using var process = Process.GetProcessById(pid.GetInt32());
            return !process.HasExited;
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException
            or FormatException or OverflowException or IOException or NotSupportedException) { return false; }
    }

    internal static bool IsMousecatSnapshot(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            return root.TryGetProperty("schema", out var schema)
                && schema.GetString() == "mousecat.operator-snapshot/2"
                && root.TryGetProperty("status", out var status)
                && status.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True;
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException) { return false; }
    }
}
