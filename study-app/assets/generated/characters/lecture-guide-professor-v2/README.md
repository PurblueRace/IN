Lecture guide professor animation frames.

Files in this folder are intended for frame-by-frame character animation in the lecture scene.

Structure:
- `idle/`: default breathing / waiting loop
- `speaking/`: active lecture explanation loop
- `pointing/`: key-point or subtopic transition loop

Planning source:
- `study-app/assets/plan/lecture-guide-animation-plan.json`

Suggested runtime mapping:
- `GUIDE_CHARACTER_FRAMES.idle`
- `GUIDE_CHARACTER_FRAMES.speaking`
- `GUIDE_CHARACTER_FRAMES.pointing`

Manifest output target:
- `study-app/assets/generated/characters/lecture-guide-professor-v2/frame-manifest.json`
