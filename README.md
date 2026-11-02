# Anno 1404 Layout Designer

An interactive, grid-based layout playground for **Anno 1404** (*Dawn of Discovery* & *Venice*), inspired by [Anno Designer](https://github.com/Anno-Designer/anno-designer) and tailored exclusively to Anno 1404's Occident and Orient buildings, footprints, road networks, and Euclidean influence radii.

## Features

- **Anno 1404 Building Palette (135 Presets)**
  - Loads authentic Anno 1404 presets, icons (`A4_*.png`), category labels, and tile color schemes from `src/assets/presets_data/`.
  - Filterable by **Region** (`All`, `Occident`, `Orient`), **Category** (`Roads`, `Housing`, `Public`, `Farms`, `Industry`, `Harbour`, `Military`, `Palace`), or instant search by name, group, or footprint (e.g. `6x5`, `3x3`).
  - Includes paintable `1×1` **Cobblestone Streets**, **Dirt Roads**, **Imperial Plazas**, **Forest / Palm Tiles**, **River / Blocked Tiles**, and road strips.
- **Interactive Grid Canvas (`react-konva`)**
  - **Dual Placement**: Click a preset in the sidebar then click (or click-and-drag) on the grid, **or** drag and drop a building card directly from the palette onto the canvas.
  - **Live Ghost Preview**: Shows snapped grid coordinates, footprint dimensions, collision validity, and live influence coverage before placing.
  - **Seamless Roads & Block Editing**: Adjacent road tiles merge cleanly without internal borders; hold `Shift` while dragging to paint straight orthogonal streets.
  - **Selection & Group Manipulation**: Click, `Shift+Click`, or marquee box-drag to select multiple structures, snap-move blocks across the grid, rotate (`R`), or clone (`Ctrl/Cmd + D`).
- **Service & Area Coverage Analysis**
  - **Euclidean Influence Overlays**: View circular influence radii for `Selected / Hover`, `All Public Services`, or `All Buildings`, and toggle **Tile Area** to inspect exact discrete grid-cell coverage.
  - **Inspector Checklist**:
    - Inspecting a **service/production building** shows how many placed residences, workshops, and farm fields fall within its radius.
    - Inspecting an **Occident or Orient residence** checks coverage across all Anno 1404 needs and maintenance services (*Marketplace*, *Chapel*, *Tavern*, *Church*, *Debtor's Prison*, *Imperial Cathedral*, *Bazaar*, *Mosque*, *Bath House*, *Sultan's Mosque*, *Carpenter's House*, *Fire Station*, *Surgery*).
    - Inspecting **farms & workshops** checks *Markethouse* pickup range, *Noria* irrigation (Orient), and orthogonal road access.
  - **Layout Footprint & Bill of Materials**: Tracks overall bounding-box dimensions, space efficiency percentage, road tile count, and per-building totals (click any row to select all instances on the grid).
- **Starter Layouts, Auto-Save & Import/Export**
  - Ships with ready-to-explore templates (*Occident Market District*, *Bread Production Cluster*, *Orient Envoy Quarter*) plus a blank grid option.
  - Automatically persists your work in `localStorage` with 60-step **Undo / Redo** history.
  - Exports high-DPI `.png` snapshots, web `.json` layouts, and desktop **Anno Designer (`.ad`)** compatible files (supports importing both `.json` and `.ad` files).

## Controls & Keyboard Shortcuts

| Input / Shortcut | Action |
| :--- | :--- |
| **Click Preset → Click Grid** | Arm a building brush and stamp/paint onto the grid |
| **Drag Preset → Drop on Grid** | Drag directly from the left palette onto a snapped grid tile |
| **`V` / `Esc`** | Switch to **Select & Move** tool / cancel active brush |
| **`B`** | Switch to **Place** tool with current building preset |
| **`D`** | Switch to **Road** brush (`1×1` street painting) |
| **`Shift + Drag`** | Paint orthogonal straight road lines / additive selection |
| **`R`** | Rotate armed brush footprint or selected building(s) |
| **`E`** | Switch to **Eraser** brush (click or drag to remove) |
| **`I` / `Alt + Click`** | **Eyedropper** — pick preset & rotation from a placed building |
| **`H` / `Space + Drag` / `Right-Drag`** | Pan around the canvas |
| **`Right-Click`** | Quick-erase building under cursor or cancel active brush |
| **`Mouse Wheel`** | Zoom smoothly toward/away from cursor (`25%` – `300%`) |
| **`Arrow Keys`** | Nudge selected building(s) by 1 grid tile |
| **`Ctrl/Cmd + D`** | Duplicate selected building(s) or city block |
| **`Ctrl/Cmd + Z` / `Ctrl/Cmd + Y`** | Undo / Redo (`Ctrl/Cmd + Shift + Z` also redoes) |
| **`Delete` / `Backspace`** | Delete selected building(s) |
| **`G` / `L`** | Toggle grid lines / building text labels |

## Tech Stack

- **Framework**: [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org) + [Vite 8](https://vite.dev)
- **2D Canvas Grid**: [Konva](https://konvajs.org) + [react-konva](https://github.com/konvajs/react-konva)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs) (with `persist` middleware & Undo/Redo history)
- **Styling & Icons**: [Tailwind CSS v4](https://tailwindcss.com) + [Heroicons](https://heroicons.com)
- **Routing**: [TanStack Router](https://tanstack.com/router)
- **Testing & Quality**: [Vitest](https://vitest.dev), [Playwright](https://playwright.dev), [ESLint](https://eslint.org), [Prettier](https://prettier.io)

## Project Structure

```text
src/
├── assets/
│   └── presets_data/               # Anno Designer preset definitions, colors, localizations & A4_*.png icons
├── features/
│   └── designer/
│       ├── components/
│       │   ├── BuildingPalette.tsx # Searchable, filterable, draggable Anno 1404 building sidebar
│       │   ├── InspectorPanel.tsx  # Service coverage analyzer, customizer & layout footprint stats
│       │   ├── LayoutCanvas.tsx    # Interactive react-konva grid, influence radii & HUD
│       │   ├── TemplatesModal.tsx  # Starter layouts, .json/.ad import-export, grid size & shortcuts dialog
│       │   └── TopToolbar.tsx      # Tool switcher, overlay toggles, PNG export & undo/redo bar
│       ├── gridMath.ts             # Collision math, Euclidean tile spans, road checks & .json/.ad serializers
│       ├── gridMath.test.ts        # Unit tests for presets, templates, coverage math, I/O & store actions
│       ├── presetsData.ts          # Anno 1404 preset parser, icon resolver & Occident/Orient need rules
│       ├── starterTemplates.ts     # Built-in Occident, Production, and Orient starter layouts
│       ├── types.ts                # Core TypeScript types for presets, grid geometry & tools
│       └── useImageCache.ts        # HTMLImageElement cache hook for flicker-free Konva icon rendering
├── pages/
│   └── Home.tsx                    # Main workbench shell & global keyboard shortcut bindings
└── store/
    └── designerStore.ts            # Zustand state store with Undo/Redo & localStorage persistence
```

## Getting Started

### Prerequisites

- [Node.js 24+](https://nodejs.org)
- [pnpm](https://pnpm.io)

### Installation & Development

```bash
# Install dependencies
pnpm install

# Start the local Vite dev server
pnpm dev
```

### Scripts

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Start Vite development server with HMR |
| `pnpm build` | Type-check with `tsc` and build production bundle to `dist/` |
| `pnpm preview` | Preview the production build locally |
| `pnpm vitest run src/` | Run unit tests once (`pnpm test:unit` runs Vitest in watch mode) |
| `pnpm lint` | Run ESLint with zero-warning enforcement |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm format` | Format TypeScript/TSX source files with Prettier |

### Docker Deployment (Optional)

```bash
pnpm build
docker build . -t anno-1404-layout-designer
docker run -p 8080:80 anno-1404-layout-designer
```

## License

MIT — see [LICENSE](LICENSE). Anno 1404 preset metadata and building icons in `src/assets/presets_data/` originate from the community [Anno Designer](https://github.com/Anno-Designer/anno-designer) preset packs.
