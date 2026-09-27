using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Mousecat.Desktop;

internal static class Program
{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SetCurrentProcessExplicitAppUserModelID(string id);

    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        SetCurrentProcessExplicitAppUserModelID("Mousecat.Desktop");
        using var mutex = new Mutex(true, @"Local\Mousecat.Desktop", out var first);
        using var activate = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\Mousecat.Desktop.Activate");
        if (!first) { activate.Set(); return; }
        Directory.CreateDirectory(DesktopSettings.DataRoot);
        Application.Run(new DesktopWindow(activate));
    }
}

internal sealed class DesktopWindow : Form
{
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
    private readonly WebView2 web = new() { Dock = DockStyle.Fill, Visible = false, DefaultBackgroundColor = Color.FromArgb(22, 18, 13) };
    private readonly Label message = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter,
        Padding = new Padding(40), Text = "Opening Mousecat…" };
    private readonly Button retry = new() { Text = "Retry", Dock = DockStyle.Bottom, Height = 44, Visible = false };
    private readonly System.Windows.Forms.Timer activationTimer = new() { Interval = 200 };
    private readonly System.Windows.Forms.Timer appearanceTimer = new() { Interval = 1000 };
    private bool readingAppearance;
    private string currentTheme = "";
    private readonly CancellationTokenSource lifetime = new();
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private readonly EventWaitHandle activate;
    private DesktopSettings? settings;
    private bool connecting;
    private string route = "#questions";
    private readonly string windowPath = Path.Combine(DesktopSettings.DataRoot, "window.json");

    internal DesktopWindow(EventWaitHandle activation)
    {
        activate = activation;
        Text = "Mousecat";
        MinimumSize = new Size(640, 480);
        Size = new Size(1280, 850);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 11);
        ApplyAppearance("manuscript");
        Controls.Add(web);
        Controls.Add(message);
        Controls.Add(retry);
        RestoreWindow();
        activationTimer.Tick += (_, _) =>
        {
            if (!activate.WaitOne(0)) return;
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
            Show(); Activate(); BringToFront();
        };
        activationTimer.Start();
        appearanceTimer.Tick += async (_, _) => await ReadAppearance();
        appearanceTimer.Start();
        Shown += async (_, _) => await Connect();
        retry.Click += async (_, _) => await Connect();
        FormClosing += (_, _) =>
        {
            SaveWindow();
            lifetime.Cancel();
            activationTimer.Stop();
            appearanceTimer.Stop();
        };
        FormClosed += (_, _) => { activationTimer.Dispose(); appearanceTimer.Dispose(); http.Dispose(); lifetime.Dispose(); };
    }

    private void ApplyAppearance(string theme)
    {
        if (theme == currentTheme) return;
        currentTheme = theme;
        var light = theme == "light";
        BackColor = light ? Color.FromArgb(233, 237, 241) : theme == "bw" ? Color.Black : Color.FromArgb(22, 18, 13);
        ForeColor = light ? Color.FromArgb(31, 41, 51) : theme == "bw" ? Color.White : Color.FromArgb(239, 230, 212);
        message.BackColor = BackColor; message.ForeColor = ForeColor;
        retry.BackColor = BackColor; retry.ForeColor = ForeColor;
        web.DefaultBackgroundColor = BackColor;
        var dark = light ? 0 : 1;
        DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int));
    }

    private async Task ReadAppearance()
    {
        if (readingAppearance || IsDisposed || web.CoreWebView2 is null) return;
        readingAppearance = true;
        try
        {
            // Read one bounded preference; no renderer-to-native command bridge.
            var value = await web.CoreWebView2.ExecuteScriptAsync("document.documentElement.dataset.theme");
            if (!IsDisposed && JsonSerializer.Deserialize<string>(value) is string theme
                && theme is "manuscript" or "bw" or "light") ApplyAppearance(theme);
        }
        catch (Exception error) when (error is InvalidOperationException or JsonException or COMException or ObjectDisposedException) { }
        finally { readingAppearance = false; }
    }

    private async Task<bool> Healthy()
    {
        try
        {
            var json = await http.GetStringAsync(new Uri(settings!.Origin, "api/snapshot"), lifetime.Token);
            if (!DesktopSettings.IsMousecatSnapshot(json)) return false;
            var recordPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".mousecat", "user-service.json");
            // An HTTP listener alone cannot establish which saved workspace it uses.
            if (!File.Exists(recordPath) || !settings.MatchesServiceRecord(await File.ReadAllTextAsync(recordPath, lifetime.Token)))
                throw new IOException("A Mousecat service is running, but it does not match this desktop's persistent workspace. "
                    + "Restart the matching Mousecat service or update the desktop configuration. No saved questions were changed.");
            return true;
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException) { return false; }
    }

    private async Task Connect()
    {
        if (connecting || lifetime.IsCancellationRequested) return;
        connecting = true;
        message.Visible = true;
        retry.Visible = false;
        message.Text = "Opening Mousecat…";
        try
        {
            settings = DesktopSettings.Load(Path.Combine(DesktopSettings.DataRoot, "desktop.json"));
            if (!await Healthy())
            {
                var start = new ProcessStartInfo(settings.NodePath)
                {
                    WorkingDirectory = settings.RepositoryRoot, UseShellExecute = false,
                    CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true
                };
                foreach (var argument in new[] { Path.Combine(settings.RepositoryRoot, "src", "cli.mjs"),
                    "--config", settings.ConfigPath, "service", "start", "--port", settings.Port.ToString() })
                    start.ArgumentList.Add(argument);
                using var process = Process.Start(start) ?? throw new IOException("Could not start Mousecat.");
                // Drain both pipes. Service output can contain private local configuration paths.
                var stdout = process.StandardOutput.ReadToEndAsync(lifetime.Token);
                var stderr = process.StandardError.ReadToEndAsync(lifetime.Token);
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
                deadline.CancelAfter(TimeSpan.FromSeconds(15));
                try { await process.WaitForExitAsync(deadline.Token); }
                catch (OperationCanceledException) { if (!process.HasExited) process.Kill(); throw; }
                await Task.WhenAll(stdout, stderr);
                if (!await Healthy()) throw new IOException("The Mousecat service did not become available. Your saved questions have not been changed.");
            }
            var environment = await CoreWebView2Environment.CreateAsync(null,
                Path.Combine(DesktopSettings.DataRoot, "WebView"));
            await web.EnsureCoreWebView2Async(environment);
            web.CoreWebView2.Settings.AreHostObjectsAllowed = false;
            web.CoreWebView2.Settings.IsWebMessageEnabled = false;
            web.CoreWebView2.Settings.IsStatusBarEnabled = false;
            web.CoreWebView2.NavigationStarting -= GuardNavigation;
            web.CoreWebView2.NavigationStarting += GuardNavigation;
            web.CoreWebView2.NewWindowRequested -= OpenLink;
            web.CoreWebView2.NewWindowRequested += OpenLink;
            web.CoreWebView2.SourceChanged -= SaveRoute;
            web.CoreWebView2.SourceChanged += SaveRoute;
            web.Source = new Uri(settings.Origin, route);
            web.Visible = true;
            message.Visible = false;
            web.Focus();
        }
        catch (Exception error)
        {
            if (IsDisposed || lifetime.IsCancellationRequested) return;
            message.Text = "Mousecat could not open.\n\n" + error.Message;
            retry.Visible = true;
        }
        finally { connecting = false; }
    }

    private void GuardNavigation(object? sender, CoreWebView2NavigationStartingEventArgs args)
    {
        if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri) || !settings!.Owns(uri)) args.Cancel = true;
    }

    private void OpenLink(object? sender, CoreWebView2NewWindowRequestedEventArgs args)
    {
        args.Handled = true;
        if (!args.IsUserInitiated || !Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri)) return;
        if (settings!.Owns(uri)) web.Source = uri;
        else if (uri.Scheme is "http" or "https")
        {
            try { Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true }); }
            catch (Exception error) { MessageBox.Show(this, error.Message, "Could not open link"); }
        }
    }

    private void SaveRoute(object? sender, CoreWebView2SourceChangedEventArgs args)
    {
        if (Uri.TryCreate(web.Source?.AbsoluteUri, UriKind.Absolute, out var uri) && settings!.Owns(uri))
            route = string.IsNullOrEmpty(uri.Fragment) ? "#questions" : uri.Fragment;
    }

    private void RestoreWindow()
    {
        try
        {
            var saved = JsonSerializer.Deserialize<WindowStateRecord>(File.ReadAllText(windowPath));
            if (saved is null) return;
            var bounds = new Rectangle(saved.X, saved.Y, Math.Clamp(saved.Width, 640, 5000), Math.Clamp(saved.Height, 480, 4000));
            if (Screen.AllScreens.Any(screen => Rectangle.Intersect(screen.WorkingArea, bounds).Width >= 200
                && Rectangle.Intersect(screen.WorkingArea, bounds).Height >= 100))
            { StartPosition = FormStartPosition.Manual; Bounds = bounds; }
            if (saved.Maximized) WindowState = FormWindowState.Maximized;
            if (saved.Route?.StartsWith('#') == true && saved.Route.Length <= 4096) route = saved.Route;
        }
        catch (Exception error) when (error is IOException or JsonException or UnauthorizedAccessException) { }
    }

    private void SaveWindow()
    {
        try
        {
            var bounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
            var saved = new WindowStateRecord(bounds.X, bounds.Y, bounds.Width, bounds.Height,
                WindowState == FormWindowState.Maximized, route);
            File.WriteAllText(windowPath + ".tmp", JsonSerializer.Serialize(saved));
            File.Move(windowPath + ".tmp", windowPath, true);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
    }

    private sealed record WindowStateRecord(int X, int Y, int Width, int Height, bool Maximized, string Route);
}
