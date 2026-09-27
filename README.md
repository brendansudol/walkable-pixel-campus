# Walkable UGA Pixel Campus Prototype

A dependency-free browser prototype of a small walkable pixel-art campus. All of the scenery is drawn in code at load time; the only image asset is the avatar sprite.

## Run it

From this folder, start any static web server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

It may also work by opening `index.html` directly, but a local server is the more reliable development setup.

## Controls

- **Move:** WASD, arrow keys, or the on-screen directional pad
- **Run:** hold Shift
- **Click-to-walk:** click or tap a walkable destination
- **Interact:** E, Enter, or the Explore button
- **Go inside:** walk up the Library or Campus Coffee steps, click the building, or press E nearby
- **Leave:** walk back out through the door at the bottom of the room
- **Zoom:** + and −
- **Debug:** Map data shows the walkable mask and hotspot radii

## How it works

The campus is a code-drawn recreation of the original generated illustration (kept for reference in `misc/campus.png`). `campus-art.js` paints it at half resolution, where one art pixel covers 2 × 2 world units, so it keeps the chunky look while lining up with the `1254 × 1254` coordinates in `map-config.js`.

- **Ground** is painted once into a background: the island slab, textured grass and lawn, brick paths with cream edges, the patio, steps, hedges, flower beds and the sign. Paths and lawns are drawn as canvas shapes, then thresholded into hard-edged masks and filled pixel by pixel with brick and grass patterns.
- **Tall things** are depth-sorted props: the stadium, buildings, trees, lamps, the Arch and the patio umbrella. The avatar can walk behind trees and through the Arch, and a faint silhouette shows through when it's hidden.
- **Gameplay data** sits on top as invisible layers: a walkability mask, collision shapes, interaction hotspots and door zones.

Click-to-walk uses a small A* navigation grid generated from the same walkability mask. Keyboard movement uses continuous circle collision against the mask.

## Interiors

The Library and Campus Coffee can be entered. Each building is its own **scene** with the same ingredients as the campus: a walk mask, nav grid, hotspots and door zones. Stepping into a door zone plays an iris transition and swaps scenes. The player arrives just inside the door, and on leaving reappears on the building's front steps.

Interior art is painted procedurally at load time (`interiors.js`, using helpers in `pixel-kit.js`) at 1 world unit = 1 pixel, so it shares the avatar's pixel density. Rooms are 512 × 512 units, so the camera sits about 2.5× closer than on the campus.

- **Depth sorting.** Furniture is drawn as separate props sorted by `sortY` against the player and NPCs. You can walk behind the stacks, tables and counters; a faint silhouette shows through when you're hidden.
- **Hotspots with actions.** Interior hotspots return dialog specs with buttons: browse the stacks and check out a book, order a drink, change the record, spin the globe, and so on. Hotspot `target` rects make the art itself clickable: click the bookshelf and the avatar walks over and opens it.
- **Carried items.** Drinks and books appear in the avatar's hands, show as chips in the corner, and travel between scenes. Some characters react to what you're holding.
- **Ambient animation.** The fire flickers, the library clock shows real time, dust drifts in window light, the espresso machine steams, the neon glows, and notes rise from the record player.

Open a scene directly with `?scene=library` or `?scene=coffee`.

### Add another interior

1. Add a scene object to `window.CAMPUS_INTERIORS` in `interiors.js` with `paint`, `props`, `npcs`, `hotspots`, `walkable`, `obstacles` and an exit `door` (`{ to: 'campus', arrive: '<campus door id>' }`).
2. Add a matching door to `doors` in `map-config.js` with a trigger `zone`, an `approach` point on the steps and an `exitSpawn`.
3. Point a campus hotspot at it with `enter: '<door id>'` and a `target` rect over the building.

Turn on **Map data** inside a room to see its walk mask, footprints, hotspots, click targets and door zones.

## Edit the map

Most campus-specific data lives in `map-config.js`:

- `spawn`
- `walkable`
- `obstacles`
- `doors`
- `hotspots`

Turn on **Map data** in the prototype while editing. Coordinates are world units in a `1254 × 1254` space.

## Edit the art

The campus look lives in `campus-art.js`:

- `RING`, `PATHS`, `PLAZAS` and `PATIO` shape the brick paths, in world units.
- `TREES`, `BUSHES` and `LAMPS` place scenery, in art pixels (world ÷ 2).
- Each building, the stadium and the Arch is an `addProp({ bounds, sortY, footprint, draw })` call. `sortY` is where the prop meets the ground, and `footprint` adds collision.

If you move a building or path, update the matching `walkable` and `obstacles` shapes in `map-config.js` so collision still lines up.

To swap in exported artwork instead, give the scene a `paint(g)` that draws an image and turn the tall pieces into props with sprites. The engine only needs a background, props with a `sortY`, and the gameplay layers.

## Add it to an existing application

This prototype is plain HTML, CSS and JavaScript, so it can be embedded directly in a static site or adapted into a React/Vue/Svelte component. Keep the animation loop and Canvas renderer imperative, and expose application events such as:

```js
onEnterLocation({ id: 'library' })
onCollectItem({ id: 'coffee-token' })
onOpenResource({ type: 'event', id: 'fall-orientation' })
```

The prototype already emits `campus:ready`, `campus:interact` and `campus:scene` (fired on every scene change with `{ id, title, from }`), both as window events and via `postMessage` when embedded in an iframe. `window.CampusWorld` exposes `goTo(id)`, `enter(sceneId)`, `getScene()`, `getInventory()`, `getPlayerPosition()`, `setZoom()` and `reset()`.

For a larger game, move the scene into Phaser and author the map data in Tiled. The same concepts remain: image or tile layers, collision objects, spawn points, interaction objects, sprite animation, and a camera.

## Prototype limitations

- All art is hand-coded pixel drawing rather than exported artwork. That suits a prototype and keeps the download tiny, but it would be slow to scale to many buildings.
- Collision geometry is intentionally approximate and hand-authored.
- The avatar is a small original placeholder sprite, not a character customization system.
- The UGA name and marks are included only because they appear in the supplied concept art. Review institutional trademark and licensing requirements before public or commercial deployment.
