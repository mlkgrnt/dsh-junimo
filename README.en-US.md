# dsh-junimo

[简体中文](README.md) · [繁體中文](README.zh-Hant.md) · **English** · [Español](README.es-ES.md)

A DeepSeek Harness plugin that gives *Stardew Valley* 37 control tools, plus the deployment checks and game lifecycle management the MCP layer cannot reach.

## Overview

This repository is a **dsh bundle**. It operates at the profile layer of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Game logic is not implemented here. All 37 tools come from `junimo-mcp.exe` (OCaml, single file) shipped by [Junimo-MCP](https://github.com/mlkgrnt/Junimo-MCP), bridged over the stdio MCP protocol by the official `@deepseek-ai/dsh-mcp-client` and surfaced to the model as `mcp__junimo__<tool>`. **This repository does not modify a single line of Junimo-MCP.**

The plugin itself has three responsibilities:

1. Wire up the MCP bridge and expose a `junimoPaths` service as the single source of truth for the executable and skill directory
2. Inject Stardew operating discipline into the system prompt, avoiding the usual timing and save-related mistakes
3. Register 4 native tools: diagnostics, window focus, game launch, save loading

Item 3 cannot be done by MCP tools — the mod runs inside the game process, so it can neither start its own process nor raise its own window.

`junimo-mcp.exe` is bundled (`bin/`, v3.2.1, 6 MB). Installing the plugin is enough; no separate binary download.

## Architecture

```
model ──mcp__junimo__*──▶ dsh-mcp-client ──stdio──▶ junimo-mcp.exe ──HTTP──▶ NagiBridge-Remix ──▶ game
                                ▲                          ▲
                         wired by dsh-junimo        reused as-is, unmodified
                         + 4 native tools
```

| Component | Provided by | Notes |
|---|---|---|
| 37 game tools | `@deepseek-ai/dsh-mcp-client` + bundled exe | Perception, movement, interaction, menus, farm work, chests, social, festivals, livelihood |
| 4 native tools | This plugin | `junimo_doctor` / `junimo_focus` / `junimo_game_launch` / `junimo_load_save` |
| Prompt discipline | This plugin | System prompt section `junimo:rules`, roughly 1000 characters |
| Bundled skill | `@deepseek-ai/dsh-skill-filesystem` | `skills/junimo/`, loaded on demand, no resident context cost |
| Reference docs | This plugin | `reference/game-semantics.md`, with a tool cheat sheet and known boundaries |

## Requirements

| Item | Requirement |
|---|---|
| OS | Windows (the kernel, the plugin and the mod each have a different platform story — see [Platform support](#platform-support)) |
| dsh | `>= 0.2.1-rc.2` (declared in `package.json` under `dsh.engines`) |
| Game | Stardew Valley 1.6.x |
| SMAPI | 4.x (`junimo_game_launch` uses it to start the game) |
| POSIX shell | bash from Git for Windows or WSL, used to launch the game. If absent it falls back to `cmd`: the game still starts, but an extra SMAPI console window appears |
| Executor mod | [NagiBridge-Remix](https://github.com/pendel001/NagiBridge-Remix), installed into `Mods/NagiBridge/` |

SMAPI and mod installation steps are in [Junimo-MCP's AGENTS.md](https://github.com/mlkgrnt/Junimo-MCP/blob/main/AGENTS.md).

> NagiBridge-Remix is licensed under PolyForm Noncommercial 1.0.0; personal and non-commercial use is free. This project does not bundle its code. The original NagiBridge and Remix use different UniqueIDs, so having both installed makes them contend for port 7842 — move the old directory out before switching.

## Installation

```bash
# local checkout
dsh plugin --profile web add link:/path/to/dsh-junimo

# or straight from GitHub (plain ESM source, no build step)
dsh plugin --profile web add github:mlkgrnt/dsh-junimo
```

`dsh plugin add` initialises the profile and appends this package to `dsh.profile.bundles`. It takes effect after restarting dsh.

Once installed, run `junimo_doctor` to check the whole chain. It reports the executable path and version, port 7842 status, mod responses, save readiness, the integrity of the SMAPI and NagiBridge files, and any error lines in the SMAPI log.

> When installing from GitHub, if you are told a build script is not authorised, add the package key pnpm gives you to `allowBuilds` in the profile's `pnpm-workspace.yaml`. This package has no build step, so it rarely triggers.

## Configuration

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `JUNIMO_MCP_BIN` | bundled `bin/junimo-mcp.exe` | Override the bundled executable, for upgrades, rollbacks or a self-built binary |
| `STARDEW_GAME_DIR` | auto-detected | Directory containing `Stardew Valley.exe`; when unset, Steam libraries and common install paths are tried in turn |
| `STARDEW_API_URL` | `http://localhost:7842` | Mod endpoint. Must be `localhost`; `127.0.0.1` is rejected by the system |
| `STARDEW_AUTO_MENU` | `1` | Passed through to the executable: auto-answer dialogues with no options |
| `STARDEW_AUTO_EVENT` | unset | Passed through to the executable: auto-skip story events, off by default |

The executable's other variables (`STARDEW_HTTP`, `STARDEW_SETTLE`, etc.) are documented in Junimo-MCP's README and can likewise be passed through via `env` in `cordis.patch.yml`.

### Overriding plugin defaults

A profile's `cordis.patch.yml` overrides plugin rows by `id`. A patch replaces `config` wholesale, so every key must be restated:

```yaml
- insert:
    - id: junimo-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      inject: [junimoPaths]
      config:
        serverName: junimo
        transport: stdio
        command: 'D:\tools\junimo-mcp.exe'
        args: []
        env: { STARDEW_API_URL: 'http://localhost:7842' }
        cwd: 'D:\tools'
        toolCallTimeoutMs: 180000
        failOnStartupError: true
```

## Tools

### Native tools

| Tool | Purpose |
|---|---|
| `junimo_doctor` | Chain diagnostics. Read-only, performs no repairs. Call it before touching the game |
| `junimo_focus` | Bring the game window to the front. SDV pauses itself when unfocused, and clicks and menu operations do nothing while paused |
| `junimo_game_launch` | Start the game via `StardewModdingAPI.exe` and wait for port 7842 to answer; does nothing if already running. SMAPI is a console program and exits instantly when spawned directly, so it is launched through bash first, falling back to `cmd` only when bash is missing |
| `junimo_load_save` | Focus the window → click Load → click the save slot → poll until `worldReady`; retries the whole round on failure |

The hard part of `junimo_load_save` is timing, not coordinates. `TitleMenu.receiveLeftClick` silently drops clicks during fade-ins and transitions, so the implementation is "wait for the UI to settle → click → decide via `worldReady` → retry the whole round". Coordinates target the title screen at 1280×720 in windowed mode.

### Bridged tools

The full list of 37 `mcp__junimo__*` tools, with arguments and caveats, is in [`reference/game-semantics.md`](./reference/game-semantics.md).

Among them, `story`'s `choose` is two-stage inside `junimo-mcp.exe`: the default path first registers the answer with the game, and if the screen does not advance it automatically follows up with one real click. Verified on a real save (pet adoption event) — the event advanced to the next scene immediately after choosing. Callers need not, and should not, send a second click.

## Maintenance

### Syncing the bundled executable

```bash
node scripts/sync-binary.mjs          # take the latest Junimo-MCP release
node scripts/sync-binary.mjs v3.2.1   # or pin a specific tag
```

The script downloads the executable and the official SHA-256, verifies them locally, and only then overwrites `bin/`, updating `bin/BUNDLED_VERSION` at the same time. Afterwards you need `git add bin/` and a commit.

The currently bundled version is in `bin/BUNDLED_VERSION`.

## Development

### Layout

```
src/index.js    Plugin entry: junimoPaths service, prompt section, 4 tool registrations
src/paths.js    Resolution and probing for the executable / game directory / bundled resources
src/api.js      Minimal HTTP client for NagiBridge (liveness and timing fallbacks)
src/doctor.js   Checks and rendering for junimo_doctor
src/game.js     Focus, launch, save loading
skills/         Bundled skill
reference/      Long-form docs read on demand
scripts/        Maintenance scripts
test/           Smoke and on-device verification scripts
```

The source is plain ESM JavaScript with no build step — `src/*.js` is the published artifact.

### Tests

```bash
node test/smoke.mjs                    # offline smoke, needs neither the game nor a dsh host
node test/verify-load-save.mjs         # on a real game: launch, load a save, verify worldReady
node test/verify-load-save.mjs --existing   # when the game is already running, verify loading only
```

The offline smoke test verifies the `junimoPaths` service, the prompt section, the registration of all 4 tools, and runs `junimo_doctor` once. It relies on a local stub of `node_modules/@deepseek-ai/dsh-tools` so it can run under plain Node; in a real deployment that package is provided by the dsh host.

### Verifying inside dsh

```bash
dsh plugin --profile <name> add link:/path/to/dsh-junimo
dsh --profile <name> --dump-config | grep -A8 junimo   # confirm all three layers joined the bundle
dsh --profile <name> --no-open                          # start; "entries did not activate" means something is wrong
```

## Platform support

The plugin currently **runs on Windows only**, but the reasons are spread across three layers rather than being one solid block. Telling them apart matters when estimating porting effort:

| Layer | Platform status | Evidence |
|---|---|---|
| OCaml kernel (what `junimo-mcp.exe` contains) | **Cross-platform, with macOS / Linux artifacts published** | Dependencies are only `yojson` + `unix`, and the source has no platform branches; CI passes every game-free assertion on Linux / macOS / Windows runners; each artifact is re-tested on its own platform before release |
| This plugin (process launch, window focus, path probing) | **Windows only** | Focus uses user32, launching goes through PowerShell and bash, Steam libraries are probed by drive letter |
| Executor mod (NagiBridge-Remix) | **Partly Windows only** | `/press_key` and `/click_tile` use `keybd_event` / `mouse_event`; `/click` uses in-process calls when a menu is open or `no_mouse` is set, and is itself portable |

The plugin bundles only the Windows `junimo-mcp.exe`. macOS and Linux users can fetch the matching artifact from [Junimo-MCP Releases](https://github.com/mlkgrnt/Junimo-MCP/releases/latest) (`junimo-mcp-macos-arm64` / `junimo-mcp-linux-x86_64`) and point `JUNIMO_MCP_BIN` at it, which is enough for most of the 37 tools. On non-Windows platforms `junimo_doctor` prints the download URL for that platform rather than a vague "executable not found".

The **plugin's own** `junimo_focus` / `junimo_game_launch` / `junimo_load_save` remain Windows-only — those three are the reason the plugin exists, and using them elsewhere means adding a platform layer yourself (focus via `osascript` / `xdotool`, path probing via each platform's Steam directory). That is where the porting boundary lies.

## Known limitations

- **The plugin is currently Windows-only.** Window focus, process launch and save loading depend on PowerShell and user32. **Junimo-MCP does already ship macOS / Linux binaries**, so you can download those and use them, or port the plugin's three tools as needed.
- **Save-loading coordinates assume the 1280×720 title screen.** Verified on a real game in windowed mode; other resolutions need recalculation, see the comments in `src/game.js`.
- **The bundled `junimo-mcp.exe` is a Junimo-MCP release artifact** (MIT). This project does not bundle NagiBridge-Remix.

## License

MIT, see [LICENSE](./LICENSE). The bundled `junimo-mcp.exe` and NagiBridge-Remix each follow their own licenses.
