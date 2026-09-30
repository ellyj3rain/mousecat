using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Mousecat.Desktop;

internal sealed class NativeFeedWindows(Form owner, DesktopSettings settings, CoreWebView2Environment environment) : IDisposable
{
    private readonly Dictionary<string, NativeFeedWindow> windows = new(StringComparer.Ordinal);
    private bool disposed;
    private string theme = "manuscript";
    internal IReadOnlyCollection<NativeFeedWindow> Windows => windows.Values;

    internal async Task Open(CoreWebView2NewWindowRequestedEventArgs args, NativeFeedRequest request)
    {
        args.Handled = true;
        var deferral = args.GetDeferral();
        try
        {
            if (disposed || owner.IsDisposed || !args.IsUserInitiated
                || !Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri)
                || !NativeFeedRequest.TryParse(settings, uri, out var actual) || actual != request) return;
            if (windows.TryGetValue(request.Identity, out var existing))
            {
                existing.RestoreAndActivate(); return;
            }
            if (windows.Count >= 16) return;
            var window = new NativeFeedWindow(settings, request);
            windows.Add(request.Identity, window);
            window.FormClosed += (_, _) =>
            {
                if (windows.TryGetValue(request.Identity, out var current) && current == window) windows.Remove(request.Identity);
            };
            try
            {
                await window.Initialize(environment);
                if (disposed || owner.IsDisposed || window.IsDisposed) { window.Close(); return; }
                window.ApplyAppearance(theme);
                // The requested context must use the opener's actual environment and
                // still be at about:blank. Chromium then binds window.opener itself.
                args.NewWindow = window.Core;
                window.StartPosition = FormStartPosition.Manual;
                window.Location = new Point(owner.Left + 40 + windows.Count * 16, owner.Top + 40 + windows.Count * 16);
                window.Show(); window.Activate();
            }
            catch
            {
                windows.Remove(request.Identity); window.Dispose(); throw;
            }
        }
        finally
        {
            // Dispose completes the native deferral. Completing it separately
            // calls the native completion twice and can invalidate the request.
            deferral.Dispose();
        }
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        foreach (var window in windows.Values.ToArray()) window.Retire();
        windows.Clear();
    }

    internal void ApplyAppearance(string value)
    {
        theme = value;
        foreach (var window in windows.Values) window.ApplyAppearance(value);
    }
}

internal sealed class NativeFeedWindow : Form
{
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
    private readonly WebView2 web = new() { Dock = DockStyle.Fill };
    private readonly DesktopSettings settings;
    private readonly NativeFeedRequest request;
    private bool returning;
    private bool closeAllowed;
    internal CoreWebView2 Core => web.CoreWebView2;

    internal NativeFeedWindow(DesktopSettings configuration, NativeFeedRequest identity)
    {
        settings = configuration; request = identity;
        Text = "Simulation · Mousecat"; Size = new Size(960, 640); MinimumSize = new Size(320, 240);
        Font = new Font("Segoe UI", 11); BackColor = Color.FromArgb(22, 18, 13);
        web.DefaultBackgroundColor = BackColor; Controls.Add(web);
        FormClosing += async (_, args) =>
        {
            if (closeAllowed || web.CoreWebView2 is null) return;
            args.Cancel = true;
            if (returning) return;
            returning = true;
            try
            {
                // Return the live tile before destroying its document and listeners.
                await Core.ExecuteScriptAsync("window.dispatchEvent(new Event('pagehide'))");
            }
            catch (Exception error) when (error is InvalidOperationException or COMException or ObjectDisposedException) { }
            finally { closeAllowed = true; if (!IsDisposed) Close(); }
        };
        FormClosed += (_, _) => web.Dispose();
    }

    internal async Task Initialize(CoreWebView2Environment environment)
    {
        await web.EnsureCoreWebView2Async(environment);
        Core.Settings.AreHostObjectsAllowed = false;
        Core.Settings.IsWebMessageEnabled = false;
        Core.Settings.IsStatusBarEnabled = false;
        Core.NavigationStarting += (_, args) =>
        {
            if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri)
                || !NativeFeedRequest.TryParse(settings, uri, out var incoming) || incoming != request) args.Cancel = true;
        };
        Core.NewWindowRequested += (_, args) => args.Handled = true;
        Core.WindowCloseRequested += (_, _) => Close();
        Core.DocumentTitleChanged += (_, _) =>
        {
            if (!IsDisposed) Text = Core.DocumentTitle[..Math.Min(Core.DocumentTitle.Length, 200)];
        };
        ApplyAppearance("manuscript");
    }

    internal void ApplyAppearance(string theme)
    {
        var light = theme == "light";
        BackColor = light ? Color.FromArgb(233, 237, 241) : theme == "bw" ? Color.Black : Color.FromArgb(22, 18, 13);
        web.DefaultBackgroundColor = BackColor;
        var dark = light ? 0 : 1; DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int));
    }

    internal void RestoreAndActivate()
    {
        if (IsDisposed) return;
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Show(); Activate(); BringToFront();
    }

    internal void Retire() { closeAllowed = true; Close(); }
}
