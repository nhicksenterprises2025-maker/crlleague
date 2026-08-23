# VECTOR GRID

**Version:** 0.2.0  
**Platform priority:** iPhone / iOS  
**Status:** iOS-first playable prototype

VECTOR GRID is a deterministic competitive tactics game built around prediction, positioning, tempo, cooldown tracking, and resource management.

## Design contract

- No random damage.
- No critical-hit chance.
- No accuracy rolls.
- No random spawns.
- No shuffled cards or loot.
- No hidden stat rolls.
- Identical game state + identical commands = identical result.

## v0.2.0 — iOS conversion

- iPhone-first responsive interface.
- Full safe-area support for Dynamic Island/notch and Home Indicator.
- Large touch controls and tap-first board interaction.
- Portrait layout plus compact landscape tactical layout.
- PWA manifest for Home Screen installation.
- Standalone/full-screen iOS web-app metadata.
- Offline service-worker cache after first successful load.
- App icon asset.
- Automatic GitHub Pages deployment workflow.
- Capacitor configuration for a native iOS wrapper.
- Native web-bundle preparation script.
- Existing deterministic simulation preserved with zero RNG.

## Core match

- 1v1 player vs deterministic CPU.
- 11x9 tactical grid.
- Three mirrored unit classes: Vanguard, Ranger, Scout.
- Simultaneous command planning and deterministic resolution.
- Energy economy with banking.
- Unit abilities and cooldown tracking.
- Three control nodes and score victory condition.
- Elimination victory condition.
- Obstacles, pathing, range checks, and line-of-sight blocking.
- Full combat/event log.
- Zero calls to `Math.random()` in game logic.

## iPhone testing

The repository includes a GitHub Pages workflow. Once Pages is active, the game is served from the repository's GitHub Pages site over HTTPS, which is required for offline/PWA features.

On iPhone:

1. Open the hosted game in Safari.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Launch **VECTOR GRID** from the Home Screen.

Landscape is the preferred competitive layout, but portrait is fully supported.

## Native iOS packaging

The same game can be wrapped as a native iOS application using Capacitor without rewriting the simulation.

On a Mac with Xcode:

```bash
npm install
npm run ios:add
npm run ios:open
```

For future updates after the native project exists:

```bash
npm run ios:sync
npm run ios:open
```

Xcode then handles signing, physical-device builds, TestFlight, and App Store distribution.

## Turn flow

1. Tap one of your units.
2. Choose Move, Attack, Guard, Ability, or Hold.
3. Tap a destination/target when required.
4. Assign any other unit orders.
5. Tap **EXECUTE TURN**.
6. Both plans resolve under deterministic rules.

## Win conditions

- Reach 12 control points, or
- Eliminate the opposing squad.

## Unit identities

- **Vanguard** — durable frontline unit; high melee damage; `CRUSH` heavy strike.
- **Ranger** — fragile ranged controller; `PIERCE` long-range heavy shot.
- **Scout** — mobile objective unit; `SURGE` extended reposition.

## Development direction

Future versions prioritize strategic depth, mobile feel, stronger simultaneous-action interactions, opponent modeling, replay systems, PvP, maps, unit kits, progression-free competitive systems, and eventually signed TestFlight/App Store distribution. RNG is not part of the competitive ruleset.
