using System.Text.Json;
using System.Text.Json.Nodes;
using Mousecat.Desktop;

var folder = Path.Combine(Path.GetTempPath(), "mousecat-desktop-test-" + Guid.NewGuid());
Directory.CreateDirectory(Path.Combine(folder, "src"));
try
{
    void Check(bool pass, string name) { if (!pass) throw new Exception(name); Console.WriteLine("PASS " + name); }
    var node = Path.Combine(folder, "node.exe");
    File.WriteAllText(node, "fixture");
    File.WriteAllText(Path.Combine(folder, "src", "cli.mjs"), "fixture");
    var config = Path.Combine(folder, "config.json");
    File.WriteAllText(config, "{\"state\":{\"enabled\":true,\"path\":\"saved.json\"}}");
    var settingsPath = Path.Combine(folder, "desktop.json");
    File.WriteAllText(settingsPath, JsonSerializer.Serialize(new DesktopSettings(folder, node, config)));
    var settings = DesktopSettings.Load(settingsPath);
    Check(settings.StatePath == Path.Combine(folder, "saved.json"), "relative state belongs to service working directory");
    Check(settings.Owns(new Uri("http://127.0.0.1:4317/#questions")), "own origin admitted");
    var binding = new string('a', 64);
    var feedUri = new Uri(settings.Origin, "native-feed.html?view=regional&binding=" + binding + "&screen=site%3Afarm");
    Check(NativeFeedRequest.TryParse(settings, feedUri, out var feed) && feed!.Screen == "site:farm", "exact native feed window admitted");
    Check(NativeFeedRequest.TryParse(settings, new Uri(settings.Origin, "native-feed.html?screen=site%3Afarm&binding=" + binding + "&view=regional"), out var reordered)
        && reordered == feed, "window identity survives query ordering");
    foreach (var query in new[] { "?view=regional&binding=" + binding + "&screen=site%3Afarm&screen=current",
        "?view=regional&binding=" + binding + "&screen=current&extra=1", "?view=regional&screen=current",
        "?view=regional&binding=bad&screen=current", "?view=regional&binding=" + binding + "&screen=site%3A..",
        "?view=regional&binding=" + binding + "&screen=feed%3A%0A", "?view=regional&binding=" + binding + "&screen=current#other" })
        Check(!NativeFeedRequest.TryParse(settings, new Uri(settings.Origin, "native-feed.html" + query), out _), "invalid feed identity refused " + query);
    Check(!NativeFeedRequest.TryParse(settings, new Uri("http://127.0.0.1:4318" + feedUri.PathAndQuery), out _), "foreign popup origin refused");
    Check(!NativeFeedRequest.TryParse(settings, new Uri(settings.Origin, "other.html" + feedUri.Query), out _), "undeclared popup route refused");
    foreach (var uri in new[] { "http://127.0.0.1:4318/", "https://127.0.0.1:4317/", "http://user@127.0.0.1:4317/", "file:///C:/", "http://example.com/" })
        Check(!settings.Owns(new Uri(uri)), "foreign navigation refused " + uri);
    Check(DesktopSettings.IsMousecatSnapshot("{\"schema\":\"mousecat.operator-snapshot/2\",\"status\":{\"ok\":true}}"), "snapshot identity admitted");
    foreach (var json in new[] { "{}", "[]", "null", "{\"schema\":true}", "not-json" })
        Check(!DesktopSettings.IsMousecatSnapshot(json), "invalid health refused");
    var record = new JsonObject { ["schema"] = "mousecat.user-service-record/1", ["serviceId"] = "mousecat-operator",
        ["configPath"] = config, ["workingDirectory"] = folder,
        ["runnerPath"] = Path.Combine(folder, "src", "service", "runner.mjs"),
        ["port"] = 4317, ["pid"] = Environment.ProcessId,
        ["persistence"] = new JsonObject { ["enabled"] = true, ["path"] = settings.StatePath } };
    Check(settings.MatchesServiceRecord(record.ToJsonString()), "exact running persistent workspace admitted");
    var alternateSeparators = (JsonObject)record.DeepClone();
    foreach (var key in new[] { "configPath", "workingDirectory", "runnerPath" })
        alternateSeparators[key] = alternateSeparators[key]!.GetValue<string>().Replace('\\', '/');
    alternateSeparators["persistence"]!["path"] = settings.StatePath.Replace('\\', '/');
    Check(settings.MatchesServiceRecord(alternateSeparators.ToJsonString()), "equivalent absolute separator paths admitted");
    var forwardSettings = settings with { RepositoryRoot = settings.RepositoryRoot.Replace('\\', '/'),
        ConfigPath = settings.ConfigPath.Replace('\\', '/') };
    Check(forwardSettings.MatchesServiceRecord(record.ToJsonString()), "forward-slash settings match native service paths");
    var foreignRoot = (JsonObject)alternateSeparators.DeepClone();
    foreignRoot["workingDirectory"] = Path.Combine(folder, "foreign").Replace('\\', '/');
    Check(!settings.MatchesServiceRecord(foreignRoot.ToJsonString()), "foreign canonical root still refused");
    var foreignState = (JsonObject)alternateSeparators.DeepClone();
    foreignState["persistence"]!["path"] = Path.Combine(folder, "foreign-state.json").Replace('\\', '/');
    Check(!settings.MatchesServiceRecord(foreignState.ToJsonString()), "foreign canonical state still refused");
    foreach (var key in new[] { "configPath", "workingDirectory", "runnerPath", "serviceId", "schema" })
    {
        var bad = (JsonObject)record.DeepClone(); bad[key] = "other";
        Check(!settings.MatchesServiceRecord(bad.ToJsonString()), "wrong identity refused " + key);
    }
    var changed = (JsonObject)record.DeepClone(); changed["persistence"]!["enabled"] = false;
    Check(!settings.MatchesServiceRecord(changed.ToJsonString()), "running nonpersistent service refused despite enabled config file");
    changed = (JsonObject)record.DeepClone(); changed["persistence"]!["path"] = "other";
    Check(!settings.MatchesServiceRecord(changed.ToJsonString()), "other saved workspace refused");
    changed = (JsonObject)record.DeepClone(); changed["pid"] = -1;
    Check(!settings.MatchesServiceRecord(changed.ToJsonString()), "invalid process identity refused");
    File.WriteAllText(config, "{\"state\":{\"enabled\":false}}");
    try { DesktopSettings.Load(settingsPath); throw new Exception("nonpersistent config accepted"); }
    catch (InvalidDataException) { Console.WriteLine("PASS disabled persistence refused"); }
}
finally { Directory.Delete(folder, recursive: true); }
