# Aim Trainer (Static)

A standalone browser aim trainer that runs entirely on static HTML, CSS, and JavaScript. Open `index.html` in any modern browser to practice flicks, tracking, and reaction speed without needing a backend server.

## Features
- Three difficulty presets (Easy/Normal/Hard) with unique spawn rates, speeds, and target sizes.
- 60-second sessions with combo bonuses, accuracy tracking, and dynamic background changes as you rack up kills.
- Local score history stored in `localStorage`, displayed in the Recent Results table.
- Target sprites, audio cues, and background art bundled under the `static/aim_game/` directory for easy customization.

## Getting Started
1. Keep the existing directory structure (`index.html` alongside the `static/` folder).
2. Double-click `index.html` or host the folder with any static file server (for example, `npx serve .`).
3. Choose a difficulty, click Start, and play right away. Results persist in the same browser until you clear site data.

## Customization Tips
- Update visuals or sounds by replacing files in `static/aim_game/img/` and `static/aim_game/audio/`.
- Adjust difficulty values inside the JSON scripts embedded near the bottom of `index.html`.
- Gameplay logic lives in `static/aim_game/js/aim_trainer.js`; tweak spawn rules, scoring, or effects there.

Enjoy the practice session!
