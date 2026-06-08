# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Nemo?

Nemo is an Electron-based process manager for macOS. It allows developers to configure, run, and monitor multiple development servers and one-off jobs through a unified GUI with integrated terminals.

## Commands

- `bun run dev` - Start SvelteKit dev server only (port 5199)
- `bun run electron:dev` - Full development mode: runs SvelteKit + Electron together
- `bun run build` - Build the SvelteKit frontend to `build/`
- `bun run electron:build` - Compile TypeScript in `electron/` to CommonJS
- `bun run dist:mac` - Build distributable macOS app to `release/`
- `bun run lint` - Run ESLint
- `bun run check` - Run svelte-check for type checking
- `bun run test` - Run all tests once
- `bun run test:unit` - Run tests in watch mode

### Testing

Tests use Vitest with two projects:
- **server**: Node environment for non-Svelte tests (`*.spec.ts`)
- **client**: Browser (Playwright) for Svelte component tests (`*.svelte.spec.ts`)

Run a single test file: `bun run test:unit -- src/lib/path/to/file.spec.ts`

## Architecture

### Electron Main Process (`electron/main.ts`)
- Manages child processes using `node-pty` for full terminal emulation
- Stores configuration in `~/Library/Application Support/nemo/nemo-data/`
- Collects CPU/memory metrics via `pidusage` (aggregates across process tree)
- Auto-detects server ports from terminal output using regex patterns
- Exposes IPC handlers for all process operations (start, stop, restart, input, resize)

### Preload (`electron/preload.ts`)
- Exposes the `window.nemo` API to the renderer via `contextBridge`
- All IPC calls are typed in `src/lib/types.ts` as `NemoAPI`

### SvelteKit Frontend (`src/`)
- Uses Svelte 5 with runes mode enabled (see `svelte.config.js`)
- State management via Svelte stores in `src/lib/stores/processes.ts`
- Terminal rendering uses xterm.js with fit addon
- Static adapter for Electron (`@sveltejs/adapter-static`)

### Key Data Types (`src/lib/types.ts`)
- `ProcessConfig`: User-defined process configuration (name, command, cwd, type: 'server' | 'job')
- `ProcessState`: Runtime state including status, pid, port, metrics
- `NemoAPI`: Complete interface for `window.nemo` IPC bridge

### Process Types
- **Servers**: Long-running processes with port detection and optional auto-restart
- **Jobs**: One-off commands that run to completion

### IPC Flow
1. Renderer calls `window.nemo.*` methods
2. Preload forwards via `ipcRenderer.invoke()`
3. Main process handles via `ipcMain.handle()`
4. Real-time events (output, exit, metrics) sent via `webContents.send()`
