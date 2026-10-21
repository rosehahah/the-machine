<div align="center">

# THE MACHINE

*"You are being watched."*

**English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Русский](README.ru.md)

<a href="https://rosehahah.github.io/the-machine/"><img src="docs/hero.webp" alt="The Machine's point of view: a rainy Times Square feed, every person boxed, one of them identified as ADMIN" width="100%"></a>

**[▶ Explore the console in your browser](https://rosehahah.github.io/the-machine/)** &nbsp;·&nbsp; [Run it on your own cameras](#quick-start) &nbsp;·&nbsp; [How it was made](#how-it-was-made)

<sub>📷 Want the machine to judge <i>you</i>? I turned this project's surveillance-style overlay into a camera mode in my iOS app <b>XianNow Camera</b> (rolling out in the next update) → <a href="https://apps.apple.com/app/id6814311061?ct=machine_readme">App Store</a></sub>

</div>

A fan-made, open-source recreation of **The Machine** from *Person of Interest*. Its point of view (the MPOV) runs on your own Mac and iPhone cameras: it boxes everyone it sees, recognizes you as ADMIN, notices a knife or a fall, and issues a number. It never says why. Alongside it is a multi-page console (camera wall, subjects, cases, network, map, log) on a mock city of 500 people.

Every box, label and colour was checked against frames from all five seasons. Anything the show never showed is marked as invented, in the code and below.

<sub>The animation above is the landing page of the demo site: stock footage, real person tracks, and a scripted identification (nobody in the footage is enrolled).</sub>

**With deep thanks to *Person of Interest*.** To Jonathan Nolan, Greg Plageman, J.J. Abrams, the writers, the cast and the crew: thank you for five seasons, for Harold and John, Root and Shaw, Fusco and Carter, Bear, and for The Machine. We love this show so much. This project exists because of you.

## The console

All six pages share one timeline at the bottom: scrub through seven days of the mock city, or watch it live.

| | |
|---|---|
| ![Camera wall](docs/screenshots/feeds.jpg) **1 FEEDS** · camera wall, 32 real Manhattan intersections | ![Single feed](docs/screenshots/feed.jpg) **1 FEEDS** · one camera |
| ![Subject dossier](docs/screenshots/subjects.jpg) **2 SUBJECTS** · dossiers: PRIMARY ASSET IDENTIFIED | ![Case](docs/screenshots/cases.jpg) **3 CASES** · the numbers |
| ![Network](docs/screenshots/network.jpg) **4 NETWORK** · who was seen with whom | ![Map](docs/screenshots/map.jpg) **5 MAP** · Manhattan, active operations |
| ![Log](docs/screenshots/log.jpg) **6 LOG** · the system log | ![MPOV on a local video file](docs/screenshots/mpov.jpg) **MPOV** · the live view, running locally |

<sub>Screenshots of this project running on mock data and [Mixkit](https://mixkit.co) stock footage. No frames from the show.</sub>

## What the MPOV does

- **Boxes every person** on your Mac camera and your iPhone (Continuity Camera), with the show's square head-and-shoulders box: dashed sides, solid corners, tick marks.
- **Recognizes you.** Enroll yourself as `ADMIN` and your box flashes from white to yellow, the dossier card opens and it says `GOOD EVENING, ADMIN.` Other roles: `PRIMARY ASSET`, `SECONDARY ASSET`, `ANALOG INTERFACE`, `IRRELEVANT`.
- **Follows you** from camera to camera.
- **Judges threats.** Someone picks up a knife, scissors, a bat or a gun: white box with red corners. If they act on it: red box, `THREAT`. Someone falls: `SUBJECT DOWN`.
- **Issues numbers.** A social security number in the show's `###-00-####` format and a phrase in the phonetic alphabet, with two rings of a payphone. Relevant and irrelevant lists, a macOS notification, and optionally an iMessage to your phone.

## Quick start

macOS only. Needs [uv](https://docs.astral.sh/uv/) and `ffmpeg`.

```bash
brew install uv ffmpeg
git clone https://github.com/rosehahah/the-machine
cd the-machine && ./run.sh
```

The first run sets up Python, downloads the models (~75 MB, `tools/fetch_models.sh`) and the stock footage for the console (`tools/build_clips.py`). That takes a few minutes. Then your browser opens **http://localhost:8000** (the MPOV); the console is at **http://localhost:8000/console**. Press `Ctrl+C` in the terminal to quit; the cameras close with it.

- **Camera permission**: macOS may ask for camera access; click Allow. If you see `NO SIGNAL`, open System Settings → Privacy & Security → Camera, turn on your terminal app, and restart.
- **iPhone camera**: Continuity Camera. Lock the iPhone, keep it near the Mac, signed in to the same Apple ID. It joins as the second feed. If it connects later, click RESCAN CAMERAS in the terminal panel.

### Become the ADMIN

1. Press `M` to open the ADMIN TERMINAL.
2. Under ENROLL SUBJECT, type a name (say `FINCH, HAROLD`) and pick the role `ADMIN`.
3. Alone in front of the current camera, about an arm's length away, click **ENROLL FROM CURRENT FEED**.
4. Hold still for about two seconds, until `PROFILE COMPILED`.

From then on, whenever you are in view, your box blinks from white to yellow and you get the `ADMIN` label, your dossier card and the greeting. `PRIMARY ASSET` and `SECONDARY ASSET` are yellow, `ANALOG INTERFACE` is black with yellow corners, `IRRELEVANT` is white. Anyone not enrolled stays white.

### Threats and numbers

The rules follow the box legend from the show:

| Box | When |
|---|---|
| White | An ordinary person |
| **White with red corners + red crosshair**, `POTENTIAL THREAT` | Holding a knife, scissors, a bat or a gun, but hasn't acted yet |
| **Red**, `THREAT` | Armed and acting on it: armed for over 4 s, or close to someone else, or in the same frame as the ADMIN or an asset (then it turns red at once) |
| Slow blink, `SUBJECT DOWN` | Someone fell: the head drops fast and stays low, or falls out of the bottom of the frame |

- **Enrolled people never change colour when armed.** Reese carries a gun all the time and his box stays yellow. To see the effect on yourself, use the drills.
- Each incident produces a **number**. Enrolled people always get the same one; strangers get an anonymous `UNKNOWN-0427` and a random number that is never matched against any outside data. Numbers live only in memory and are gone on restart.
- **Two lists**: the ADMIN or an asset threatened or down → `RELEVANT`; anything else → `IRRELEVANT`. Browse them in ADMIN TERMINAL → THE LIST, jump to the camera, close the case.
- **Drills** (ADMIN TERMINAL → DRILLS): `SIMULATE ARMED SUBJECT` arms the largest person in view for 6 s, `SIMULATE SUBJECT DOWN` makes them fall. Drills ignore the "enrolled people don't escalate" rule, so you can try it alone. Their numbers are marked `DRILL`.
- **Dissemination** (ADMIN TERMINAL → DISSEMINATION): macOS notifications are on by default. For iMessage, enter your phone number or Apple ID and click SAVE (off by default; sends the number and the phrase, never a photo). `SEND TEST` tries it.

Weapons are found by two models: YOLOX on every frame (fast, but misses knives held in a hand), and OWLv2 re-checking each feed with people in it about every 2 s in the background (it does see a knife or a gun in a hand). So expect 2–4 s from picking up a knife to the box changing. A knife that stays in the same place (a knife block, a wall rack) is treated as furniture, and so is any knife already in view at startup.

### Keys

| MPOV | |
|---|---|
| `M` | Open or close the ADMIN TERMINAL |
| `1`–`9` | Switch camera (turns off auto-follow) |
| `F` | Full screen |
| `X` | Grade and film effects on or off |
| `Esc` | Close the terminal panel |

**Auto-follow** (AUTO-FOLLOW in the terminal): when someone identified leaves the current camera and shows up on another, the view cuts to it.

**Console**: `1`–`6` switch pages, `Space` play/pause, `←` `→` one minute back or forward (`Shift` for an hour), `L` back to live, `F` full screen, `Esc` from a single feed back to the wall. On the map: wheel to zoom, drag to pan, click a camera for its card.

### Without a camera

```bash
./run.sh --no-cameras --source ~/Movies/clip.mp4   # a video file as the only feed
./run.sh --source photo.png                        # cameras plus an extra feed
```

## The console, page by page

The mock city comes from `tools/gen_world.py`: 500 people, 7 days, 32 cameras at real Manhattan intersections, 30 numbers. It is regenerated on startup when its date window is stale (on the demo site, the seven days always end today). Real cameras and real numbers join it as LIVE.

| Page | What's on it | Matched against |
|---|---|---|
| `1` FEEDS | The camera wall (16:9 grid) and single feeds | The S1 surveillance collage; the S2 camera caption, e.g. `WASH SQ PK 8 11 / 11:15:51` |
| `2` SUBJECTS | Everyone, and their dossiers, laid over the camera where they were last seen | S05E02 08m17s, the `PRIMARY ASSET IDENTIFIED` panel |
| `3` CASES | The numbers and their cases | The two-tone status bar (SPEC §4) and the same dossier panel |
| `4` NETWORK | Who was seen with whom (*the graph itself is invented*) | Styled after the S2–S3 national map: black, points of light, white Futura, thin white frames |
| `5` MAP | Manhattan: cameras, open numbers, a subject's last 24 hours | S04E13 37m42s and S04E21 36m04s: white water on dark land, 1 km grid, district stat boxes, red crosshair, `ACTIVE OPERATION` rings |
| `6` LOG | Identifications, cases and system messages (*the page itself is invented*) | The S05E13 36m04s system box, `[1] CORE SYSTEMS SHUTTING DOWN` |

The map is built by `tools/build_map.py` from OpenStreetMap streets and coastline (shapely closes the coastline into land), cached in `media/osm_manhattan.json`, written to `web/data/manhattan.json`.

## How it was made

The rule for this project: **every element on screen must match a frame from the show.** If the show never shows it, it is marked *invented* (自创 in the code comments) instead of being slipped in.

1. **The spec.** [`research/SPEC.md`](research/SPEC.md) (in Chinese) pins down the MPOV from about 30 stills and the fan wiki's box symbols: the two visual eras (S1 surveillance cam, S3–S5 graded MPOV), box geometry, the colour legend, labels, the two-tone status bar, the dossier card and the grade. Open questions are marked "to be checked".
2. **Searching all 103 episodes.** `tools/index_clip.py` builds a CLIP index of frames across the whole series; `tools/find_shots.py` searches it with a still or a sentence ("a map of Manhattan with a red crosshair"). The hits became the reference frames listed in the table above. You need your own copy of the show for this; neither the index nor the frames are in this repository.
3. **Rebuilding, then checking.** Each page was rebuilt next to its reference frames and compared again. Mistakes that got caught this way: boxes must be square and framed on the head and shoulders, not the whole body (`headBox()` in `web/hud.js`, the same rule as `head_from_person` in `backend/vision.py`); and the TCK card, the red ▽, `ELIMINATE` and the white `DEVIANT` tag belong to Samaritan's view (SPOV), so they appear nowhere here.

The rest is plain engineering: ffmpeg captures the cameras, YOLOX detects people, YuNet and SFace find and recognize faces, ByteTrack tracks people across frames, OWLv2 double-checks weapons. The interface is WebGL for the grade and Canvas for the boxes, set in Futura.

## Privacy

- Faces stay on your Mac. Enrolled face embeddings are in `data/identities.json`; delete that file and everyone is forgotten.
- Nothing is uploaded. Strangers are never identified. They only get an anonymous ID.
- The tracker doesn't infer age, gender or emotion.
- `data/` is git-ignored, as are the models, the stock footage and any frames from the show.

## Project layout

| Path | What |
|---|---|
| `backend/server.py` | Local server: the vision loop and the API |
| `backend/cameras.py` | Frame sources: Mac and iPhone cameras through ffmpeg, video and image files |
| `backend/vision.py` | People (YOLOX), faces (YuNet + SFace), tracking (ByteTrack) |
| `backend/threat.py` | Threat engine: armed, escalation, falls |
| `backend/numberbook.py` | Numbers, the two lists, notifications and iMessage |
| `web/` | The MPOV: `fx.js` (WebGL grade), `hud.js` (boxes and labels), `app.js` |
| `web/console/` | The console: one file per page in `pages/`, mock data in `world.js`, the shared `timeline.js` |
| `web/fonts/` | VT323 (the camera captions' pixel font) and Share Tech Mono (S4–S5 cards and the map), both OFL |
| `tools/gen_world.py`, `tools/build_map.py`, `tools/build_clips.py` | The mock city, the Manhattan map, the stock footage and its person tracks |
| `tools/fetch_models.sh`, `tools/export_owlv2.py` | Download YuNet, SFace, YOLOX; export OWLv2 to ONNX (360 MB, optional; without it, weapons are YOLOX only) |
| `tools/index_clip.py`, `tools/find_shots.py` | The CLIP frame index and search over the show (needs your own copy) |
| `site/`, `tools/build_site.sh` | The demo site; `tools/build_site.sh --publish` pushes it to `gh-pages` |
| `research/SPEC.md` | The MPOV interface spec |
| `data/` | Your enrolled faces and notification settings. Local only, git-ignored |

## Status

- **Done**: P0 spec · P1 *it sees* · P2 *it knows you* (enroll, recognize, multiple cameras, auto-follow) · P3 *it judges* (armed, falls, red boxes, two lists, numbers, notifications) · the six-page console and the demo site.
- **Not yet**: P4 and on: the prediction tree, the spliced voice, talking to the ADMIN, the midnight wipe, Samaritan.
- Threats are only two things for now: a weapon in hand, and a fall. Fights or someone tailing you need a pose model.
- Weapon detection misses some: a fast swing, a blurry frame, a knife side-on to the camera.
- Recognition is face-only. Someone with their back to the camera gets a box but no name; someone already recognized keeps their name on the same camera when they turn around.

## Credits

*Unofficial fan project. Not affiliated with or endorsed by CBS, Warner Bros. Television, Kilter Films or Bad Robot. "Person of Interest" and all related names belong to their owners. No footage or stills from the show are included in this repository.*

- Map: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL
- Footage: [Mixkit](https://mixkit.co) (Mixkit Stock Video Free License), downloaded at run time, not redistributed
- Models: YuNet (MIT), SFace (Apache-2.0) and YOLOX (Apache-2.0) from the OpenCV model zoo; Google OWLv2 (Apache-2.0)
- Fonts: VT323, Share Tech Mono (SIL OFL 1.1)
- Code: MIT, see [`LICENSE`](LICENSE)
