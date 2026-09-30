namespace Mousecat.Desktop;

internal sealed record NativeFeedRequest(string View, string Binding, string Screen)
{
    internal string Identity => View + "\n" + Binding + "\n" + Screen;

    internal static bool TryParse(DesktopSettings settings, Uri uri, out NativeFeedRequest? request)
    {
        request = null;
        if (!settings.Owns(uri) || uri.AbsolutePath != "/native-feed.html"
            || uri.Fragment.Length != 0 || uri.Query.Length > 1200) return false;
        var fields = new Dictionary<string, string>(StringComparer.Ordinal);
        try
        {
            foreach (var field in uri.Query.TrimStart('?').Split('&'))
            {
                var parts = field.Split('=', 2);
                if (parts.Length != 2 || !fields.TryAdd(Uri.UnescapeDataString(parts[0]),
                    Uri.UnescapeDataString(parts[1].Replace('+', ' ')))) return false;
            }
        }
        catch (UriFormatException) { return false; }
        if (fields.Count != 3 || !fields.TryGetValue("view", out var view)
            || !fields.TryGetValue("binding", out var binding) || !fields.TryGetValue("screen", out var screen)) return false;
        bool SafeId(string value, int maximum) => value.Length is > 0 && value.Length <= maximum
            && value.All(c => c is >= 'a' and <= 'z' or >= '0' and <= '9' or '-');
        if (!SafeId(view, 80) || binding.Length != 64
            || !binding.All(c => c is >= 'a' and <= 'f' or >= '0' and <= '9')) return false;
        if (screen != "current" && !(screen.StartsWith("site:", StringComparison.Ordinal) && SafeId(screen[5..], 64))
            && !(screen.StartsWith("feed:", StringComparison.Ordinal) && screen.Length is > 5 and <= 133
                && !screen.Any(char.IsControl))) return false;
        request = new(view, binding, screen);
        return true;
    }
}
