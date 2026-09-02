window.CAMPUS_MAP = {
  width: 1254,
  height: 1254,

  // The player's feet begin in the right-hand opening of the Arch.
  spawn: { x: 646, y: 1087, direction: 'up' },

  // The prototype treats this generated illustration as a visual backdrop.
  // These shapes form an invisible walkability mask over it.
  walkable: {
    ellipses: [
      // Central quad, surrounding walk and a little breathing room.
      { x: 248, y: 535, width: 626, height: 414 },
      // Coffee patio / southwest plaza.
      { x: 120, y: 834, width: 282, height: 178 },
      // Library forecourt.
      { x: 825, y: 850, width: 288, height: 188 },
      // Arch plaza.
      { x: 456, y: 905, width: 330, height: 226 },
      // Historic North Campus frontage.
      { x: 285, y: 470, width: 500, height: 162 },
      // Classical building frontage.
      { x: 760, y: 500, width: 350, height: 160 }
    ],
    rects: [
      { x: 580, y: 930, width: 118, height: 205 },
      { x: 920, y: 920, width: 103, height: 210 },
      { x: 286, y: 920, width: 98, height: 210 }
    ],
    strokes: [
      // Entrance and lower forks.
      { width: 100, points: [[646, 1130], [646, 1000], [625, 920], [565, 875]] },
      { width: 86, points: [[565, 900], [430, 930], [330, 980], [245, 946]] },
      { width: 86, points: [[610, 900], [790, 925], [970, 1010]] },

      // Upper approaches.
      { width: 74, points: [[410, 590], [310, 552], [215, 520]] },
      { width: 76, points: [[465, 570], [455, 510]] },
      { width: 76, points: [[640, 570], [640, 500]] },
      { width: 80, points: [[815, 610], [930, 604], [978, 574]] }
    ],
    polygons: [
      // Small plazas immediately outside building entrances.
      { points: [[390, 490], [520, 490], [545, 585], [365, 585]] },
      { points: [[594, 490], [690, 490], [710, 585], [578, 585]] },
      { points: [[890, 540], [1055, 540], [1085, 650], [835, 650]] },
      { points: [[180, 875], [350, 875], [388, 995], [145, 995]] },
      { points: [[885, 900], [1068, 900], [1085, 1050], [842, 1050]] }
    ]
  },

  obstacles: {
    ellipses: [
      // Stadium bowl and the fountain / monument.
      { x: 250, y: 40, width: 515, height: 315 },
      { x: 510, y: 642, width: 125, height: 142 }
    ],
    rects: [
      // Historic academic complex.
      { x: 235, y: 300, width: 535, height: 215 },
      // White-columned building.
      { x: 820, y: 242, width: 323, height: 360 },
      // Coffee shop body; patio remains walkable.
      { x: 90, y: 704, width: 220, height: 209 },
      // Library body.
      { x: 867, y: 618, width: 315, height: 355 },

      // The three Arch pillars. The openings between them remain walkable.
      { x: 523, y: 953, width: 39, height: 137 },
      { x: 590, y: 953, width: 39, height: 137 },
      { x: 660, y: 953, width: 41, height: 137 }
    ],
    polygons: []
  },

  foregroundRules: [
    {
      image: 'foreground-arch.png',
      x: 502,
      y: 902,
      // When the player's feet are north of this line, redraw the Arch over
      // the avatar to create a simple under-the-arch depth illusion.
      activeWhen: { xMin: 495, xMax: 728, yMin: 905, yMax: 1073 }
    }
  ],

  hotspots: [
    {
      id: 'arch',
      x: 640,
      y: 1040,
      radius: 88,
      title: 'The Arch',
      eyebrow: 'North Campus entrance',
      body: 'A natural interaction point for welcoming visitors, beginning a tour, choosing a destination, or opening a campus directory.'
    },
    {
      id: 'coffee',
      x: 326,
      y: 934,
      radius: 102,
      title: 'Campus Coffee',
      eyebrow: 'A small social destination',
      body: 'This could open a menu, trigger dialogue, award a daily item, start a minigame, or act as a meeting place for other avatars.'
    },
    {
      id: 'library',
      x: 974,
      y: 1020,
      radius: 98,
      title: 'Library',
      eyebrow: 'Academic destination',
      body: 'Use a hotspot like this to open searchable resources, show events, enter an interior scene, or launch a focused study experience.'
    },
    {
      id: 'quad',
      x: 704,
      y: 820,
      radius: 142,
      title: 'Herty Field–inspired Quad',
      eyebrow: 'Central campus lawn',
      body: 'The open lawn works well for ambient characters, seasonal events, collectibles, orientation prompts, or multiplayer gathering.'
    },
    {
      id: 'chapel',
      x: 973,
      y: 620,
      radius: 93,
      title: 'Historic Hall',
      eyebrow: 'Classical North Campus architecture',
      body: 'A building entrance can be a portal to another scene while the exterior map remains a compact navigational hub.'
    },
    {
      id: 'old-campus',
      x: 456,
      y: 548,
      radius: 88,
      title: 'Historic North Campus',
      eyebrow: 'Red-brick academic core',
      body: 'This area can host story markers, guided-tour narration, faculty or student NPCs, and links into academic content.'
    },
    {
      id: 'stadium',
      x: 645,
      y: 522,
      radius: 84,
      title: 'Sanford Stadium Overlook',
      eyebrow: 'Athletics landmark',
      body: 'From here the app could surface schedules, traditions, archival media, game-day content, or a separate stadium scene.'
    }
  ]
};
