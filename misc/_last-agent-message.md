# Yes—this is very possible

The cleanest way to build it is to treat the campus illustration as a **2D game world**, not as a 3D model.

The avatar has an `x, y` position on top of the image. Invisible map data determines where the avatar may walk, which objects block movement, what locations can be interacted with, and which visual elements should appear in front of the avatar.

Conceptually, the rendering stack looks like this:

```text
Foreground layer
  Tree canopies, arches, roof edges

Avatar, NPCs and animated objects

Background map
  Ground, paths, lawns, buildings

Invisible gameplay data
  Collision, walkability, destinations, doors, spawn points
```

That creates the illusion of walking through a 2.5D pixel world while everything is rendered efficiently in 2D.

## I built a working prototype

The prototype uses the latest campus image as its initial map.

### Files

[Open or download the standalone interactive demo](sandbox:/mnt/data/uga-campus-walkable-demo.html)

[Download the complete editable project](sandbox:/mnt/data/uga-campus-walkable-demo.zip)

[View the editable map configuration](sandbox:/mnt/data/uga-campus-walkable-demo/map-config.js)

[Read the project documentation](sandbox:/mnt/data/uga-campus-walkable-demo/README.md)

The standalone version is one self-contained HTML file. Download it and open it in a modern browser; it does not require installation or a development server.

The ZIP contains the separated HTML, CSS, JavaScript, map, avatar sprite, foreground layer, configuration, and React embedding example.

## What the prototype already does

It includes:

- A small four-direction animated pixel avatar
- WASD and arrow-key movement
- Touch-screen directional controls
- Click-to-walk navigation
- A\* pathfinding around buildings and obstacles
- An invisible walkability mask
- Collision around buildings, the fountain, and the Arch pillars
- Interactive locations at the library, coffee shop, quad, Arch, historic buildings, and stadium overlook
- Camera zoom and player-follow behavior
- A foreground overlay that allows the avatar to appear to walk beneath the Arch
- A debug mode that displays walkable space and interaction areas

Use **Map data** in the toolbar to see the invisible gameplay geometry.

## How the current image becomes a map

The map image itself contains no understanding of “grass,” “building,” “door,” or “path.” Those concepts have to be added as separate data.

In this prototype, `map-config.js` contains broad geometric shapes such as:

```js
walkable: {
  ellipses: [
    // The central quad
    { x: 248, y: 535, width: 626, height: 414 }
  ],

  strokes: [
    // A walkable path
    {
      width: 100,
      points: [
        [646, 1130],
        [646, 1000],
        [625, 920]
      ]
    }
  ]
},

obstacles: {
  rects: [
    // Library footprint
    { x: 867, y: 618, width: 315, height: 355 }
  ]
}
```

The application draws those shapes onto an invisible canvas. The avatar’s feet are tested against that canvas during movement.

Click-to-walk uses the same information to generate a navigation grid. When you click the quad, for example, the application calculates a path from the Arch to the destination without crossing the library, coffee shop, buildings, fountain, or Arch pillars.

## How to add it to an existing web application

### Fastest React or Next.js approach

Copy the project folder into:

```text
public/campus/
```

Then use the included:

[React embedding example](sandbox:/mnt/data/uga-campus-walkable-demo/react-embed-example.jsx)

The basic usage is:

```jsx
<CampusWorld
  onInteract={({ id }) => {
    router.push(`/campus/${id}`)
  }}
/>
```

The embedded world sends messages such as:

```js
{
  type: "campus:interact",
  hotspot: {
    id: "library",
    title: "Library"
  }
}
```

Your surrounding application can respond by:

- Opening a library search interface
- Showing an events panel
- Navigating to another page
- Starting dialogue
- Entering an interior scene
- Saving visit progress
- Awarding an achievement

### Controlling it from the application

When the world runs directly in the same page, the prototype exposes a small API:

```js
CampusWorld.goTo("coffee")
CampusWorld.setZoom(1.8)
CampusWorld.reset()

const position = CampusWorld.getPlayerPosition()
```

A production version would normally formalize this into something like:

```js
const world = createCampusWorld(canvas, {
  onInteract(location) {
    app.openLocation(location.id)
  },

  onMove(position) {
    app.savePlayerPosition(position)
  },
})
```

That keeps the game renderer separate from the rest of the website.

## Is the flattened image enough?

### For a prototype: yes

Using this one image as a background is an excellent way to prove the experience. You can add:

- Navigation
- Hotspots
- Dialogue
- Guided tours
- Collectibles
- Location labels
- Links to real campus information
- Simple NPCs
- Ambient animation

without rebuilding the artwork.

### For a production experience: eventually split it into layers

A single flattened image has one major limitation: the buildings and trees are permanently baked into the background.

For example, an avatar cannot naturally disappear behind a tree canopy unless that canopy is also available as a separate transparent image. In the prototype, I demonstrated this technique with the Arch.

A production-ready asset package should ideally contain:

```text
ground.png
  Grass, paths, plazas, water and landscaping beds

buildings-back.png
  Buildings and objects that always sit below characters

props.png
  Benches, lamps, tables, signs and decorations

foreground.png
  Tree canopies, arches, awnings and roof edges

collision.json
  Building footprints and blocked areas

hotspots.json
  Entrances, destinations and interaction points

avatar.png
  Character animation frames
```

An even better version would make individual buildings and trees separate sprites. Then you could change seasons, turn lights on, animate trees, hide buildings, decorate for events, or replace individual locations.

## The recommended production tools

The prototype is intentionally dependency-free and uses the browser’s Canvas renderer. That makes it easy to understand and embed.

For a larger experience, I would use **Phaser** as the 2D game layer. Phaser’s official tooling includes a project generator, and its framework provides scene organization, cameras, input handling, game objects, animation, and 2D physics systems. Its current official setup begins with:

```bash
npm create @phaserjs/game@latest
```

([Phaser Documentation][1])

I would pair Phaser with **Tiled**, a visual map editor. Tiled can place the campus illustration on an image layer and store collision rectangles, polygons, paths, spawn points, entrances, and custom properties on object layers. Its polygon objects are specifically suited to irregular collision areas, while polylines can represent paths to follow. ([Tiled Documentation][2])

The resulting production stack would be:

```text
React / Next.js application
        │
        ├── Navigation, accounts, content and UI
        │
        └── Phaser campus scene
                │
                ├── Tiled map data
                ├── Pixel-art layers
                ├── Avatar and NPC sprites
                ├── Collision and navigation
                └── Interaction events
```

You do **not** need Three.js or a 3D engine for this visual approach. The world is fundamentally 2D; the apparent depth comes from artwork, layering, character anchoring, shadows, and occlusion.

## A good interactive-map art prompt

For future maps, I would modify the visual prompt so the generated composition supports navigation:

> Create a polished, near-top-down 2.5D pixel-art environment designed as a walkable game map. Use a shallow orthographic viewing angle, with roofs dominant and only minimal building façades visible. Include broad, clearly connected paths, unobstructed building entrances, open gathering spaces, and distinct landmarks arranged around the perimeter. Keep trees and decorative objects away from major walking routes. Use crisp hard-edged pixel clusters, a warm limited palette, compact shadows, and a clean management-simulation game aesthetic. No people, vehicles, text over pathways, extreme perspective, or dense visual clutter.

Useful additions include:

> Ensure that every featured building has a clearly visible entrance connected to the central path network.

And:

> Leave sufficient open ground around trees and architecture for a small player sprite to navigate.

That reduces the amount of collision approximation required later.

## A sensible development path

The prototype is the first stage: one background image, one avatar, hand-authored collisions, click-to-walk, and hotspots.

The next stage would split the artwork into foreground and background layers, add custom avatar options, place a few animated NPCs, and turn the library and coffee shop into portals to small interior scenes. After that, the same framework could support guided campus tours, quests, events, login-based progress, real campus information, or a lightweight multiplayer gathering space.

For any public or commercial release using the UGA name, institutional marks, or the Georgia “G,” the branding and trademark use should also receive an appropriate rights review; UGA states that its registered marks are governed by procedures for both external and internal uses. ([news.uga.edu][3])

[1]: https://docs.phaser.io/phaser/getting-started/installation "https://docs.phaser.io/phaser/getting-started/installation"
[2]: https://docs.mapeditor.org/en/stable/manual/objects/ "https://docs.mapeditor.org/en/stable/manual/objects/"
[3]: https://news.uga.edu/revised-trademark-policy/?utm_source=chatgpt.com "Revised trademark policy - UGA Today - University of Georgia"
