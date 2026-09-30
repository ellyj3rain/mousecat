# Mousecat desktop

The Windows desktop client opens the same personal Mousecat workspace available
in the browser. Questions, plans, decisions and history belong to the shared
local service. Agent connections and client windows can come and go without
removing unanswered work. Project context comes through the existing project
and skill contracts; the desktop client contains no project-specific workflow.

## Install from source

Use Windows x64, Node.js 20 or newer, the .NET 9 SDK and the Microsoft Edge
WebView2 Evergreen Runtime. Install the repository's npm dependencies first.
From the repository root:

```powershell
powershell -NoProfile -File scripts/install-desktop.ps1
```

The installer builds a self-contained executable, installs it for the current
user, and adds **Mousecat** to the Desktop and Start menu. The SDK is needed to
build; the installed executable carries its .NET runtime. WebView2 remains an
installed Windows dependency. No browser tab or terminal is needed to use it.

The installer uses the checkout's local configuration when present. A supplied
`-ConfigPath` selects another one; `-Port` defaults to 4317. Configuration must
enable local state. For a fresh installation with no checkout configuration, the
installer creates a private persistent configuration under LocalAppData. Existing
configuration and saved questions are retained. Close the desktop window before
updating the installed executable; the background service may remain running.

Double-clicking the shortcut opens the Questions view on first use. Later opens
restore the last location and window position. Launching it again focuses the
existing window. Closing the window leaves the shared service and its questions
available, including to the browser and connected agents. If the service is
stopped, opening the client starts it through the existing service manager.
Ordinary restored open/deferred questions are immediately answerable without an
agent reconnecting. Completed work stays in history. Sensitive content that was
redacted on disk remains unavailable for answering after restart.

## Implementation boundary

**Settings (gear) > Appearance** offers Manuscript, B&W and Light. The setting
is saved in the desktop WebView profile independently of other browsers, applies
immediately and follows the window on reopening. The native frame follows the
selected scheme. Manuscript is the initial warm dark theme.

In Simulation, **Focus** opens the selected feed in its own movable, resizable
desktop window. **Redock** or its title-bar close returns the same tile to the
observatory. Its Tools menu reveals information, visibility and regional camera
controls. The feed stays live while the main window opens Questions or Reviews;
all windows share one source poller, command owner and image-delivery counter.
Session replacement and desktop shutdown retire the detached windows. Final
frames remain visible when a run ends, with native camera commands disabled.


`Program.cs` owns window lifecycle, single-instance activation, local-service
startup and the embedded view. `DesktopSettings.cs` validates the installed
configuration and exact loopback origin.
`NativeFeedRequest.cs` and `NativeFeedWindows.cs` validate and host up to sixteen
user-opened feed windows in the same GPU-capable WebView2 environment and profile.
The client supplies no software-rendering or GPU-disabling browser flags.
The executable renders the existing
operator surface in WebView2 and uses its existing safe response commands.
It does not answer questions, interpret decisions or create a second state store.
It exposes no host objects or script-to-native messages. User-selected external
web links open in the normal browser; the embedded window stays on Mousecat.
The client checks the service's private process record for the exact configured
workspace and effective enabled persistence. A different or unverified service
on the same port produces a visible error; the client does not replace it or
silently attach to another state store.

The private installation lives under `%LOCALAPPDATA%/Mousecat/Desktop`: `app`
contains the executable, `desktop.json` records local installation paths,
`window.json` records window position and route, and `WebView` is its browser
profile. These generated files stay outside source. Submitted responses persist
in the shared configured state store. Unsubmitted form edits remain local to the
open view; this change does not introduce cross-window draft synchronization.

The browser remains fully supported at the configured loopback address. Both
clients see the same submitted status on their next snapshot refresh. The
native project-world application and later visualization work remain separate
capabilities.

Build and contract checks:

```powershell
dotnet build apps/mousecat-desktop/Mousecat.Desktop.csproj -c Release
dotnet run --project apps/mousecat-desktop/tests/DesktopContracts.csproj -c Release
```

Bounded graphical acceptance uses isolated synthetic feeds and an ephemeral
profile, leaving the installed desktop and saved questions intact:

```powershell
$env:MOUSECAT_BROWSER_TEST='1'
node --test test/native-view-browser.test.mjs
$env:MOUSECAT_DESKTOP_TEST='1'
node --test test/native-window-desktop.test.mjs
```
