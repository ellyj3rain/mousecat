# Native producer view

Launch the native runtime with `-MousecatNativeView="<absolute directory>"`.
This path takes precedence over replay and world generation. It displays the
producer's PNG pixels, preserves their aspect ratio, and creates no world
geometry or player pawn. The last validated image stays visible if a snapshot
is temporarily missing, incomplete, or rejected.

The feed directory contains a latest.json manifest, flat PNG files, and a commands directory.
The producer publishes a complete PNG under a unique filename before atomically
replacing that manifest. The JSON document is at most 1 MiB:

```json
{
  "schema": "mousecat.native-view/1",
  "sessionId": "f1d4f27d-05fe-407e-9d0c-ac97156b51bc",
  "sequence": 1,
  "capturedAtUnixMs": 1790000000000,
  "image": {"file": "frame-1.png", "sha256": "<64 hexadecimal characters>", "width": 960, "height": 540},
  "state": "running",
  "title": "Native view",
  "summary": "Producer description of the current frame.",
  "people": [{"id": "person-1", "label": "Person", "summary": "Producer description."}],
  "lastCommandSequence": 0,
  "camera": {"mode": "automatic", "personIds": ["person-1"], "summary": "Following observed activity."}
}
```

The consumer polls every 25 ms with one bounded background reader and decoder.
It verifies SHA-256 before PNG decoding, checks encoded and declared dimensions,
and accepts images up to 4096 by 2160 pixels and 16 MiB compressed. An unchanged
session, filename, hash and dimensions reuse the validated image. One texture
and at most one pending texture upload keep the display allocation bounded.
Frame metadata and its decoded pixels are accepted together. Panel text layout
is cached until its content, dimensions or font changes. This viewer has a
60 FPS display ceiling; the producer controls simulation time. The displayed
Images/s and Viewer FPS distinguish source-image delivery from viewer updates.
JSON duplicate keys, nonfinite numbers, unknown fields, invalid UUIDs, duplicate
person IDs, and filenames containing paths are rejected. Integers use the exact
JSON range through 9007199254740991; frame sequences start at one and command
acknowledgements at zero. Text limits are 160 characters for titles and labels,
128 for person IDs and image filenames, and 4096 for summaries. At most 2048
people are accepted. PNG filenames use ASCII letters, digits, dots, hyphens,
and underscores, end in `.png`, and contain no `..`, initial dot, or Windows
device name. Linked image files and linked command directories are rejected.

Each new snapshot advances its sequence. Capture time and acknowledgement may
stay equal but cannot move backwards. Changing any snapshot content at an
existing sequence is rejected. The first valid session is retained for this
view's lifetime; a different session disables requests and requires explicitly
closing and reopening the view. A paused producer continues publishing current
snapshots so the connection remains observable. After three seconds without a
fresh frame the view says **Stale**; after ten it says **Disconnected** and
disables requests. An ended session retains its final image and accepts no
requests. Source data always appears as **Unreviewed**; this view has no dataset
admission or ratification controls.

The optional `camera` object contains exactly `mode`, `personIds`, and `summary`.
Mode is `automatic` or `manual`; the array contains at most five unique IDs
present in this frame's `people`; summary is a string of at most 512 characters.
An empty array is valid. The producer owns camera selection and explains it in
the summary. Mousecat shows the reported mode and summary and follows the first
person on each automatic camera target change. Tab can select another inspector
subject between camera cuts, allowing Tab then F. Missing camera metadata makes
no camera-mode claim. Both `camera` and `commandResult` are independently optional.

| Input | Request |
|---|---|
| Arrow keys or WASD | `pan` with camera-only `dx` and `dy`, each -8, 0, or 8 |
| Left-button drag within the image | `pan`, with integer `dx` and `dy` bounded to -8 through 8 |
| Space | `pause` or `resume` |
| 1, 2, 3 | `speed` with `value` 1, 2, or 3 |
| Tab / Shift+Tab | Select a reported person locally |
| F | `focus` with the selected `personId` |
| R | `auto`, with no action-specific fields |
| Escape | `stop` |

Pan and focus request manual camera control, which the producer maintains until
an `auto` request resumes its automatic activity camera. The UI reports the
producer's mode and keeps changes marked Requested until processed. The footer
shows these controls, including R to return to automatic observation.

The native viewer keeps the cursor visible, releases permanent cursor capture,
and reads keys after the controller's input update. Keyboard controls use the
focused UE window; pointing at the image restores viewport focus within that
window. They do not read global keyboard state. The console keeps its own focus.
A drag must begin inside the aspect-fitted image, not its letterbox or inspector.
Dragging moves the camera opposite cursor travel, at one producer pan unit per
24 displayed pixels, limited to five requests per second. Leaving the image or
losing window focus cancels the drag. Arrow and WASD aliases do not add together;
opposing directions cancel. Keyboard pan takes precedence over dragging.

Requests are UTF-8 JSON files published through a same-directory rename in
`commands/0000000000000001.json`, with overwrite disabled on Windows. Each has
`schema: "mousecat.native-view-command/1"`, the active `sessionId`, its positive
integer `sequence`, and `action`. Only the action-specific fields in the table
are added. No request includes shell, script, MCP, or arbitrary invocation text.
The producer validates the session and action, processes commands in sequence,
and advances `lastCommandSequence` after processing. Acknowledgement is distinct
from application. Producers may include the optional field below after their
first processed request:

```json
"commandResult": {"sequence": 1, "status": "rejected", "message": "Camera target is unavailable."}
```

The result contains exactly `sequence`, `status`, and `message`. Its positive
integer sequence equals `lastCommandSequence`, status is `applied` or `rejected`,
and message is a string of at most 512 characters. Reusing a result sequence
with different status or message is rejected. A missing result makes no outcome
claim. A rejection remains visible until a subsequent explicit `applied` result;
advancing the processed cursor alone does not clear it.

The UI keeps requests marked **Requested** until processed. A new viewer starts
above both the current processed cursor and every existing command filename;
concurrent writers do not replace a file. A failed write or ordinary rename
retains its sequence for retry. Only successful publication or a verified
existing-file collision advances the number.

## Verification

`Mousecat.NativeView.Protocol` is an Unreal automation test compiled with the
runtime. It accepts the shared manifest and rejects duplicate keys, fractional
or overflowing sequences, traversal/drive filenames, oversized dimensions,
unrecognized state, negative acknowledgements, malformed command outcomes, and
camera metadata with invalid modes, duplicate/unknown people, oversized groups,
invalid text or unknown fields. It checks automatic inspector following while
preserving local selection between camera cuts.
It also checks that rejected outcomes persist without an explicit application.
`Mousecat.NativeView.CommandPublish` exercises the actual publication helper in
an isolated automation directory: failed write, failed rename, recovery without
a sequence gap, and a collision that preserves the existing command. The
`Mousecat.NativeView.Input` feeds Unreal PlayerInput events through the actual
viewer controls into an isolated command directory. It covers WASD/arrow aliases,
opposing keys, R's exact command shape, unfocused input, image drag bounds, focus
loss, person selection/focus, pause/resume, speed and stop. This checks the input
and transport logic; desktop focus delivery and visual layout still need runtime
interaction. The standard app README contains the UE 5.8 build commands.
Building is separate from running tests.

Graphical acceptance exercises a valid producer image at wide and narrow window
sizes, mismatched image hashes, stale/ended frames, rollback, unexpected session
change, command collisions, pause/speed/focus acknowledgements, and retained
images during atomic replacement. That acceptance requires an explicitly
launched runtime and a producer; compilation does not establish it.
