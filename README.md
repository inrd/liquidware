# liquidware

Minimal WebGPU experiment bootstrapped with TypeScript and Vite.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Controls

- A floating toolbar overlaps the canvas; drag it by its handle to move it around.
- Rotate the scene via mouse drag, keyboard arrow keys or toolbar arrows
- `edit` shows the live WebGPU canvas and keeps rotation controls enabled.
- `render` captures a rasterized still of the current scene, applies some post-processing treatments, and provides `download` and `copy` options.
