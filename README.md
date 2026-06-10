# Nemo

A simple Electron-based process manager for running and monitoring local terminal processes.

![screenshot](/static/screenshot.png)

## Features

- Add, edit, and delete process configurations
- Start/stop processes with a single click
- Live terminal emulator with full PTY support
- Real-time CPU and memory monitoring
- Auto-restart option for servers that crash
- Support for long-running servers and one-time jobs

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run electron:dev

# Or run separately:
bun run dev          # Start SvelteKit dev server
bun run electron:build && ./node_modules/.bin/electron .  # Start Electron
```

## Building

```bash
# Build for production
bun run dist
```

This creates distributable packages in the `release/` directory.

### Launching on macOS without a terminal

```bash
bun run dist:mac
```

This creates a double-clickable `Nemo.app` under `release/`. Open it from Finder or drag it into `/Applications`. When Nemo is running, macOS shows a menu bar item with the number of running server processes.

If macOS blocks a task from writing to a folder or drive, grant Nemo access in **System Settings > Privacy & Security > Files and Folders**. For projects on external drives, network volumes, or other protected locations, grant Nemo **Full Disk Access** in the same Privacy & Security section.

## Data Storage

All data is stored in JSON files in the Electron user data directory:

- **macOS**: `~/Library/Application Support/nemo/nemo-data/`
- **Linux**: `~/.config/nemo/nemo-data/`
- **Windows**: `%APPDATA%/nemo/nemo-data/`

Files:

- `processes.json` - Process configurations
- `metrics.json` - Historical CPU/memory metrics
- `port-history.json` - Port usage history for conflict detection

## Tech Stack

- [Electron](https://www.electronjs.org/) - Desktop app framework
- [SvelteKit](https://kit.svelte.dev/) - Frontend framework
- [node-pty](https://github.com/microsoft/node-pty) - Pseudo-terminal support
- [xterm.js](https://xtermjs.org/) - Terminal emulator
- [pidusage](https://github.com/soyuka/pidusage) - Process metrics

## License

MIT
