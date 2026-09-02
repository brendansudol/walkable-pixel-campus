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
- **Zoom:** + and −
- **Debug:** Map data shows the walkable mask and hotspot radii

## How it works

The current campus art is used as one static background image. The app adds four data and rendering layers:

1. **Walkability mask** — broad ellipses, paths and plazas specify where feet may go.
2. **Collision shapes** — buildings, the fountain and Arch pillars remove non-walkable space.
3. **Interaction hotspots** — simple points with radii trigger the Library, Coffee, Quad and other cards.
4. **Foreground overlay** — selected artwork is redrawn above the avatar to create a basic depth illusion at the Arch.

Click-to-walk uses a small A* navigation grid generated from the same walkability mask. Keyboard movement uses continuous circle collision against the mask.

## Edit the map

Most map-specific data lives in `map-config.js`:

- `spawn`
- `walkable`
- `obstacles`
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

For a larger game, move the scene into Phaser and author the map data in Tiled. The same concepts remain: image or tile layers, collision objects, spawn points, interaction objects, sprite animation, and a camera.

## Prototype limitations

- The map is a single flattened generated image, so most objects cannot independently animate or change.
- Occlusion is demonstrated only at the Arch.
- Collision geometry is intentionally approximate and hand-authored.
- The avatar is a small original placeholder sprite, not a character customization system.
- The UGA name and marks are included only because they appear in the supplied concept art. Review institutional trademark and licensing requirements before public or commercial deployment.
