# Walkable UGA Pixel Campus Prototype

A dependency-free browser prototype that turns the generated campus illustration into a small walkable world.

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

The current campus art is used as one static background image. The app adds four data and rendering layers:

1. **Walkability mask** — broad ellipses, paths and plazas specify where feet may go.
2. **Collision shapes** — buildings, the fountain and Arch pillars remove non-walkable space.
3. **Interaction hotspots** — simple points with radii trigger the Library, Coffee, Quad and other cards.
4. **Foreground overlay** — selected artwork is redrawn above the avatar to create a basic depth illusion at the Arch.

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
- `foregroundRules`
- `hotspots`

Turn on **Map data** in the prototype while editing. Coordinates use the original image space: `1254 × 1254`.

## Replace the art

Replace `campus-map.png` with another image of the same dimensions and edit the shapes in `map-config.js`. For a map with a different size, change `width` and `height` as well.

For a production version, export the artwork as separate files instead of relying on one flattened image:

- `ground.png` — grass, paths and water
- `buildings-back.png` or individual building sprites
- `props.png` — benches, lamps and signs
- `foreground.png` — tree canopies, arches and roof edges that should cover the avatar
- `collision` — polygons authored separately from visual artwork
- `hotspots` — doors, destinations, dialogue triggers and spawn points

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

- The map is a single flattened generated image, so most objects cannot independently animate or change.
- On the campus map, occlusion is demonstrated only at the Arch. Interiors use proper depth-sorted props.
- Interior art is hand-coded pixel drawing rather than exported artwork, which suits a prototype but would be slow to scale to many buildings.
- Collision geometry is intentionally approximate and hand-authored.
- The avatar is a small original placeholder sprite, not a character customization system.
- The UGA name and marks are included only because they appear in the supplied concept art. Review institutional trademark and licensing requirements before public or commercial deployment.
