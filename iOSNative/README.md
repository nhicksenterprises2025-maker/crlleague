# PROJECT LOCKSTEP — Native iOS v0.1.0

This directory is now the primary game codebase. The earlier VECTOR GRID web prototype is legacy only.

## Platform
- iPhone first
- Native Swift + SpriteKit + SwiftUI
- Landscape-only competitive layout
- Minimum iOS 17

## Design contract
- No random numbers in simulation or combat
- No critical-hit chance
- No accuracy rolls
- No random spawns
- No loot or card draws
- Same state + same inputs = same result

## v0.1.0 gameplay
- Real-time 1v1 tactical combat vs deterministic AI
- One directly controlled Commander per side
- Three drones per side: Assault, Shield, Interceptor
- Native twin-stick touch controls
- Commander fire: 16 damage, 8 energy, 0.22s cooldown
- 100 max energy, 18 energy/sec regeneration
- Dash: 24 energy, 140-point displacement, 2.2s cooldown
- Guard: 30 energy, 1.2s duration, incoming damage multiplied by 0.4
- Tap-select drones and tap the battlefield to reposition them
- Drones automatically fire at the deterministic nearest valid target
- Central Core overload objective plus commander-elimination victory
- Fixed 60 Hz simulation step

## Native build
The repository uses XcodeGen so the project definition stays reviewable in Git.

On a Mac:

```sh
brew install xcodegen
cd iOSNative
xcodegen generate
open ProjectLockstep.xcodeproj
```

The GitHub Actions workflow generates the Xcode project and compiles an unsigned iPhone Simulator build automatically.

A physical iPhone/TestFlight build will still require Apple code signing/provisioning.
