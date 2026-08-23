# VECTOR GRID

**Version:** 0.1.0  
**Status:** First playable prototype

VECTOR GRID is a deterministic competitive tactics game built around prediction, positioning, tempo, cooldown tracking, and resource management.

## Design contract

- No random damage.
- No critical-hit chance.
- No accuracy rolls.
- No random spawns.
- No shuffled cards or loot.
- No hidden stat rolls.
- Identical game state + identical commands = identical result.

The game is intended to make wins and losses explainable. Every outcome should trace back to decisions, positioning, resource usage, or execution order defined by the rules.

## v0.1.0

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

## Play

Open `index.html` in a modern browser. No build step or server is required.

### Turn flow

1. Select one of your units.
2. Assign one order: Move, Attack, Guard, Ability, or Hold.
3. Repeat for any other units you want to command.
4. Press **EXECUTE TURN**.
5. The deterministic CPU creates its orders from the visible board state.
6. Both sides resolve their orders under the same rules.

### Win conditions

- Reach 12 control points, or
- Eliminate the opposing squad.

## Current unit identities

- **Vanguard** — durable frontline unit; high melee damage; `CRUSH` heavy strike.
- **Ranger** — fragile ranged controller; `PIERCE` long-range heavy shot.
- **Scout** — mobile objective unit; `SURGE` extended reposition.

## Development direction

The next versions will deepen the deterministic decision space rather than add chance: stronger simultaneous-action interactions, more terrain rules, better opponent modeling, replayability, local PvP, additional maps, expanded unit kits, and competitive/stat systems.
