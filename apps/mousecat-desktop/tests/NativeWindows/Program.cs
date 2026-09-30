using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Mousecat.Desktop;

internal static class NativeWindowProbe
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new Probe(new Uri(args[0]), args[1]));
    }

    private sealed class Probe : Form
    {
        private readonly WebView2 web = new() { Dock = DockStyle.Fill };
        private readonly Uri origin;
        private readonly string output;
        private NativeFeedWindows? windows;
        private Exception? windowFailure;
        internal Probe(Uri source, string folder)
        {
            origin = source; output = folder; Size = new Size(1280, 850);
            ShowInTaskbar = false; StartPosition = FormStartPosition.Manual; Location = new Point(-20000, -20000);
            Controls.Add(web); Shown += async (_, _) => await Run();
            FormClosing += (_, _) => windows?.Dispose();
        }
        private async Task Wait(Func<Task<bool>> predicate, string description)
        {
            for (var n = 0; n < 200; n++)
            {
                if (windowFailure is not null) throw new Exception("Native popup event failed", windowFailure);
                if (await predicate()) return;
                await Task.Delay(50);
            }
            throw new Exception("Timed out: " + description);
        }
        private async Task<bool> Truth(CoreWebView2 core, string expression) =>
            await core.ExecuteScriptAsync("Boolean(" + expression + ")") == "true";
        private async Task ClickAt(CoreWebView2 core, string selector)
        {
            var json = await core.ExecuteScriptAsync("(()=>{const r=document.querySelector(" + JsonSerializer.Serialize(selector)
                + ").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
            using var point = JsonDocument.Parse(json);
            var x = point.RootElement.GetProperty("x").GetDouble(); var y = point.RootElement.GetProperty("y").GetDouble();
            foreach (var type in new[] { "mousePressed", "mouseReleased" })
                await core.CallDevToolsProtocolMethodAsync("Input.dispatchMouseEvent", JsonSerializer.Serialize(new { type, x, y, button = "left", clickCount = 1 }));
        }
        private async Task Run()
        {
            try
            {
                var settings = new DesktopSettings(output, output, output, origin.Port);
                var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(output, "profile"));
                await web.EnsureCoreWebView2Async(environment);
                web.CoreWebView2.Settings.AreHostObjectsAllowed = false; web.CoreWebView2.Settings.IsWebMessageEnabled = false;
                windows = new NativeFeedWindows(this, settings, web.CoreWebView2.Environment);
                web.CoreWebView2.NewWindowRequested += async (_, args) =>
                {
                    args.Handled = true;
                    if (args.IsUserInitiated && Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri)
                        && NativeFeedRequest.TryParse(settings, uri, out var request))
                    {
                        try { await windows.Open(args, request!); }
                        catch (Exception error) { windowFailure = error; }
                    }
                };
                web.Source = new Uri(origin, "#native-view?session=regional");
                const string tile = ".native-feed-card[data-site-id='farm']";
                await Wait(() => Truth(web.CoreWebView2, "document.querySelector(" + JsonSerializer.Serialize(tile) + ")?.querySelector('img').src"), "initial native tile");
                await web.CoreWebView2.ExecuteScriptAsync("window.__probeTile=document.querySelector(" + JsonSerializer.Serialize(tile) + ")");
                await ClickAt(web.CoreWebView2, tile + " .native-panel-tools > button");
                await Wait(() => Task.FromResult(windows.Windows.Count == 1), "native Form creation");
                var child = windows.Windows.Single();
                await Wait(() => Task.FromResult(child.Visible), "initialized native Form");
                await Wait(() => Truth(child.Core, "document.querySelector('[data-native-feed-root] > article') === window.opener.__probeTile"), "same live DOM/opener adoption");
                if (child.Handle == IntPtr.Zero || child.FormBorderStyle != FormBorderStyle.Sizable) throw new Exception("Popup is not a real resizable native Form");
                child.Bounds = new Rectangle(-19000, -19000, 700, 500);
                if (child.Location != new Point(-19000, -19000) || child.Size != new Size(700, 500)) throw new Exception("Native window did not move and resize");
                Console.WriteLine("PASS actual WinForms/WebView2 popup preserves opener, same tile, native movement and resize");
                child.Size = new Size(320, 500); await Task.Delay(100);
                if (!await Truth(child.Core, "document.documentElement.scrollWidth <= innerWidth"))
                    throw new Exception("Narrow native feed window overflows: " + await child.Core.ExecuteScriptAsync("JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>[e.tagName,e.className,e.getBoundingClientRect().width])})"));
                child.Size = new Size(700, 500);
                var original = child.Core.Source;
                child.Core.Navigate(new Uri(origin, "#questions").AbsoluteUri); await Task.Delay(200);
                if (child.Core.Source != original) throw new Exception("Detached host admitted a foreign route");
                Console.WriteLine("PASS actual detached navigation guard");
                windows.ApplyAppearance("light");
                if (child.BackColor != Color.FromArgb(233, 237, 241)) throw new Exception("Detached native frame lost the shared appearance");
                Console.WriteLine("PASS native detached frame follows shared appearance");
                await ClickAt(child.Core, tile + " .native-panel-tools > button");
                await Wait(() => Task.FromResult(windows.Windows.Count == 0), "native window.close redock");
                await Wait(() => Truth(web.CoreWebView2, "document.querySelector(" + JsonSerializer.Serialize(tile) + ") === window.__probeTile"), "same tile returned");
                Console.WriteLine("PASS actual redock closes native Form and returns original live DOM");
                await ClickAt(web.CoreWebView2, tile + " .native-panel-tools > button");
                await Wait(() => Task.FromResult(windows.Windows.Count == 1), "second native Form");
                child = windows.Windows.Single();
                await Wait(() => Task.FromResult(child.Visible), "second initialized native Form");
                await Wait(() => Truth(child.Core, "document.querySelector('[data-native-feed-root] > article') === window.opener.__probeTile"), "second adoption");
                child.Close();
                await Wait(() => Task.FromResult(windows.Windows.Count == 0), "native close retirement");
                await Wait(() => Truth(web.CoreWebView2, "document.querySelector(" + JsonSerializer.Serialize(tile) + ") === window.__probeTile"), "native close restores original tile");
                await Wait(() => Truth(web.CoreWebView2, "window.__probeTile.querySelector('.native-panel-tools > button').textContent === 'Focus'"), "native close completes owner retirement");
                Console.WriteLine("PASS native title-bar close returns original live DOM");
                await ClickAt(web.CoreWebView2, tile + " .native-panel-tools > button");
                await Wait(() => Task.FromResult(windows.Windows.Count == 1), "third native Form");
                child = windows.Windows.Single();
                await Wait(() => Truth(child.Core, "document.querySelector('[data-native-feed-root] > article') === window.opener.__probeTile"), "third adoption");
                windows.Dispose();
                if (windows.Windows.Count != 0 || !child.IsDisposed) throw new Exception("Owner shutdown retained a native feed window");
                Console.WriteLine("PASS native owner disposal retires child windows and references");
                File.WriteAllText(Path.Combine(output, "result.json"), JsonSerializer.Serialize(new { success = true, windows = 0 }));
            }
            catch (Exception error)
            {
                Environment.ExitCode = 1; Console.WriteLine("FAIL " + error);
                if (web.CoreWebView2 is not null) Console.WriteLine("DOM " + await web.CoreWebView2.ExecuteScriptAsync("document.body?.innerText"));
                File.WriteAllText(Path.Combine(output, "result.json"), JsonSerializer.Serialize(new { success = false, message = error.Message }));
            }
            finally { windows?.Dispose(); web.Dispose(); Close(); }
        }
    }
}
