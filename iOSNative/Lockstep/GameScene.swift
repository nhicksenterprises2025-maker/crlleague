import SpriteKit
import UIKit

final class CombatUnit {
    enum Team { case player, enemy }
    enum Kind { case commander, assault, shield, interceptor }

    let id: String
    let team: Team
    let kind: Kind
    let node: SKShapeNode
    let maxHP: CGFloat
    var hp: CGFloat
    var moveTarget: CGPoint?
    var fireCooldown: CGFloat = 0
    var guardRemaining: CGFloat = 0
    var alive = true

    init(id: String, team: Team, kind: Kind, position: CGPoint) {
        self.id = id
        self.team = team
        self.kind = kind

        switch kind {
        case .commander: maxHP = 180
        case .assault: maxHP = 90
        case .shield: maxHP = 120
        case .interceptor: maxHP = 75
        }
        hp = maxHP

        let radius: CGFloat = kind == .commander ? 30 : 21
        node = SKShapeNode(circleOfRadius: radius)
        node.position = position
        node.lineWidth = kind == .commander ? 4 : 3
        node.zPosition = 10
    }
}

struct Projectile {
    let node: SKShapeNode
    let team: CombatUnit.Team
    var velocity: CGVector
    let damage: CGFloat
    var life: CGFloat
}

final class GameScene: SKScene {
    private let fixedStep: CGFloat = 1.0 / 60.0
    private var accumulator: CGFloat = 0
    private var lastUpdateTime: TimeInterval = 0
    private var matchTime: CGFloat = 0

    private var units: [CombatUnit] = []
    private var projectiles: [Projectile] = []

    private var playerEnergy: CGFloat = 100
    private var enemyEnergy: CGFloat = 100
    private let energyRegen: CGFloat = 18

    private var playerCore: CGFloat = 0
    private var enemyCore: CGFloat = 0
    private let coreTarget: CGFloat = 100

    private var selectedDroneID: String?
    private weak var moveTouch: UITouch?
    private weak var aimTouch: UITouch?
    private var moveVector = CGVector.zero
    private var aimVector = CGVector(dx: 1, dy: 0)
    private var firing = false

    private var playerDashCooldown: CGFloat = 0
    private var enemyDashCooldown: CGFloat = 0
    private var matchOver = false

    private let moveStickBase = SKShapeNode(circleOfRadius: 68)
    private let moveStickKnob = SKShapeNode(circleOfRadius: 27)
    private let aimStickBase = SKShapeNode(circleOfRadius: 68)
    private let aimStickKnob = SKShapeNode(circleOfRadius: 27)
    private let dashButton = SKShapeNode(circleOfRadius: 42)
    private let guardButton = SKShapeNode(circleOfRadius: 42)
    private let coreNode = SKShapeNode(circleOfRadius: 78)

    private let energyLabel = SKLabelNode(fontNamed: "AvenirNext-Bold")
    private let coreLabel = SKLabelNode(fontNamed: "AvenirNext-Bold")
    private let hintLabel = SKLabelNode(fontNamed: "AvenirNext-DemiBold")
    private let resultLabel = SKLabelNode(fontNamed: "AvenirNext-Heavy")
    private var droneButtons: [String: SKShapeNode] = [:]

    override func didMove(to view: SKView) {
        backgroundColor = UIColor(red: 0.035, green: 0.05, blue: 0.07, alpha: 1)
        anchorPoint = .zero
        setupArena()
        setupHUD()
        spawnUnits()
        updateHUD()
    }

    private func setupArena() {
        let border = SKShapeNode(rect: CGRect(x: 42, y: 42, width: size.width - 84, height: size.height - 84), cornerRadius: 18)
        border.strokeColor = UIColor(white: 0.25, alpha: 1)
        border.lineWidth = 3
        border.fillColor = UIColor(red: 0.05, green: 0.07, blue: 0.095, alpha: 1)
        border.zPosition = 0
        addChild(border)

        for x in stride(from: CGFloat(170), through: CGFloat(1196), by: CGFloat(171)) {
            let line = SKShapeNode(rectOf: CGSize(width: 1, height: 620))
            line.position = CGPoint(x: x, y: 384)
            line.strokeColor = UIColor(white: 0.18, alpha: 0.5)
            line.zPosition = 1
            addChild(line)
        }

        coreNode.position = CGPoint(x: size.width / 2, y: size.height / 2)
        coreNode.strokeColor = UIColor(red: 0.85, green: 0.95, blue: 0.38, alpha: 1)
        coreNode.fillColor = UIColor(red: 0.85, green: 0.95, blue: 0.38, alpha: 0.08)
        coreNode.lineWidth = 4
        coreNode.zPosition = 2
        addChild(coreNode)

        let coreInner = SKShapeNode(circleOfRadius: 34)
        coreInner.position = coreNode.position
        coreInner.strokeColor = UIColor(red: 0.85, green: 0.95, blue: 0.38, alpha: 0.7)
        coreInner.lineWidth = 2
        coreInner.zPosition = 2
        addChild(coreInner)
    }

    private func setupHUD() {
        moveStickBase.position = CGPoint(x: 150, y: 135)
        aimStickBase.position = CGPoint(x: size.width - 150, y: 135)
        for base in [moveStickBase, aimStickBase] {
            base.strokeColor = UIColor(white: 0.55, alpha: 0.35)
            base.fillColor = UIColor(white: 0.1, alpha: 0.25)
            base.lineWidth = 3
            base.zPosition = 50
            addChild(base)
        }

        moveStickKnob.position = moveStickBase.position
        aimStickKnob.position = aimStickBase.position
        for knob in [moveStickKnob, aimStickKnob] {
            knob.strokeColor = UIColor(white: 0.85, alpha: 0.65)
            knob.fillColor = UIColor(white: 0.9, alpha: 0.18)
            knob.lineWidth = 2
            knob.zPosition = 51
            addChild(knob)
        }

        dashButton.position = CGPoint(x: size.width - 290, y: 205)
        guardButton.position = CGPoint(x: size.width - 390, y: 115)
        configureAbilityButton(dashButton, title: "DASH")
        configureAbilityButton(guardButton, title: "GUARD")

        energyLabel.fontSize = 23
        energyLabel.horizontalAlignmentMode = .left
        energyLabel.position = CGPoint(x: 58, y: size.height - 78)
        energyLabel.zPosition = 70
        addChild(energyLabel)

        coreLabel.fontSize = 22
        coreLabel.position = CGPoint(x: size.width / 2, y: size.height - 78)
        coreLabel.zPosition = 70
        addChild(coreLabel)

        hintLabel.fontSize = 16
        hintLabel.fontColor = UIColor(white: 0.72, alpha: 1)
        hintLabel.position = CGPoint(x: size.width / 2, y: 52)
        hintLabel.text = "MOVE left · AIM/FIRE right · tap a drone, then tap battlefield"
        hintLabel.zPosition = 70
        addChild(hintLabel)

        resultLabel.fontSize = 74
        resultLabel.position = CGPoint(x: size.width / 2, y: size.height / 2 + 130)
        resultLabel.zPosition = 100
        resultLabel.isHidden = true
        addChild(resultLabel)

        let ids = ["pA", "pS", "pI"]
        let names = ["A", "S", "I"]
        for i in 0..<ids.count {
            let button = SKShapeNode(circleOfRadius: 31)
            button.position = CGPoint(x: 390 + CGFloat(i) * 78, y: size.height - 86)
            button.strokeColor = UIColor(red: 0.2, green: 0.82, blue: 1, alpha: 0.75)
            button.fillColor = UIColor(red: 0.2, green: 0.82, blue: 1, alpha: 0.08)
            button.lineWidth = 2
            button.zPosition = 70
            let label = SKLabelNode(fontNamed: "AvenirNext-Heavy")
            label.text = names[i]
            label.fontSize = 18
            label.verticalAlignmentMode = .center
            label.zPosition = 71
            button.addChild(label)
            addChild(button)
            droneButtons[ids[i]] = button
        }
    }

    private func configureAbilityButton(_ node: SKShapeNode, title: String) {
        node.strokeColor = UIColor(white: 0.7, alpha: 0.55)
        node.fillColor = UIColor(white: 0.16, alpha: 0.5)
        node.lineWidth = 3
        node.zPosition = 60
        let label = SKLabelNode(fontNamed: "AvenirNext-Heavy")
        label.text = title
        label.fontSize = 13
        label.verticalAlignmentMode = .center
        label.zPosition = 61
        node.addChild(label)
        addChild(node)
    }

    private func spawnUnits() {
        units = [
            makeUnit(id: "pC", team: .player, kind: .commander, at: CGPoint(x: 215, y: 385)),
            makeUnit(id: "pA", team: .player, kind: .assault, at: CGPoint(x: 300, y: 500)),
            makeUnit(id: "pS", team: .player, kind: .shield, at: CGPoint(x: 300, y: 385)),
            makeUnit(id: "pI", team: .player, kind: .interceptor, at: CGPoint(x: 300, y: 270)),
            makeUnit(id: "eC", team: .enemy, kind: .commander, at: CGPoint(x: size.width - 215, y: 385)),
            makeUnit(id: "eA", team: .enemy, kind: .assault, at: CGPoint(x: size.width - 300, y: 500)),
            makeUnit(id: "eS", team: .enemy, kind: .shield, at: CGPoint(x: size.width - 300, y: 385)),
            makeUnit(id: "eI", team: .enemy, kind: .interceptor, at: CGPoint(x: size.width - 300, y: 270))
        ]
    }

    private func makeUnit(id: String, team: CombatUnit.Team, kind: CombatUnit.Kind, at position: CGPoint) -> CombatUnit {
        let unit = CombatUnit(id: id, team: team, kind: kind, position: position)
        let player = team == .player
        unit.node.strokeColor = player ? UIColor(red: 0.2, green: 0.82, blue: 1, alpha: 1) : UIColor(red: 1, green: 0.36, blue: 0.22, alpha: 1)
        unit.node.fillColor = player ? UIColor(red: 0.2, green: 0.82, blue: 1, alpha: 0.14) : UIColor(red: 1, green: 0.36, blue: 0.22, alpha: 0.14)

        let glyph = SKLabelNode(fontNamed: "AvenirNext-Heavy")
        glyph.text = glyphFor(kind)
        glyph.fontSize = kind == .commander ? 20 : 15
        glyph.verticalAlignmentMode = .center
        glyph.fontColor = unit.node.strokeColor
        unit.node.addChild(glyph)

        let barBack = SKShapeNode(rectOf: CGSize(width: kind == .commander ? 66 : 48, height: 5), cornerRadius: 2)
        barBack.name = "hpBack"
        barBack.position = CGPoint(x: 0, y: kind == .commander ? -42 : -32)
        barBack.fillColor = .black
        barBack.strokeColor = .clear
        unit.node.addChild(barBack)

        let bar = SKShapeNode(rectOf: CGSize(width: kind == .commander ? 64 : 46, height: 3), cornerRadius: 1)
        bar.name = "hp"
        bar.position = barBack.position
        bar.fillColor = UIColor(red: 0.45, green: 0.9, blue: 0.62, alpha: 1)
        bar.strokeColor = .clear
        unit.node.addChild(bar)

        addChild(unit.node)
        return unit
    }

    private func glyphFor(_ kind: CombatUnit.Kind) -> String {
        switch kind {
        case .commander: return "C"
        case .assault: return "A"
        case .shield: return "S"
        case .interceptor: return "I"
        }
    }

    override func update(_ currentTime: TimeInterval) {
        guard !matchOver else { return }
        if lastUpdateTime == 0 { lastUpdateTime = currentTime }
        let frame = min(CGFloat(currentTime - lastUpdateTime), 0.05)
        lastUpdateTime = currentTime
        accumulator += frame
        while accumulator >= fixedStep {
            fixedUpdate(dt: fixedStep)
            accumulator -= fixedStep
        }
    }

    private func fixedUpdate(dt: CGFloat) {
        matchTime += dt
        playerEnergy = min(100, playerEnergy + energyRegen * dt)
        enemyEnergy = min(100, enemyEnergy + energyRegen * dt)
        playerDashCooldown = max(0, playerDashCooldown - dt)
        enemyDashCooldown = max(0, enemyDashCooldown - dt)

        for unit in units where unit.alive {
            unit.fireCooldown = max(0, unit.fireCooldown - dt)
            unit.guardRemaining = max(0, unit.guardRemaining - dt)
        }

        updatePlayerCommander(dt: dt)
        updatePlayerDrones(dt: dt)
        updateEnemyAI(dt: dt)
        updateProjectiles(dt: dt)
        updateCore(dt: dt)
        checkVictory()
        updateHUD()
    }

    private func updatePlayerCommander(dt: CGFloat) {
        guard let commander = unit(id: "pC"), commander.alive else { return }
        let speed: CGFloat = 255
        commander.node.position.x += moveVector.dx * speed * dt
        commander.node.position.y += moveVector.dy * speed * dt
        clampToArena(commander.node)

        if firing && playerEnergy >= 8 && commander.fireCooldown <= 0 {
            spawnProjectile(from: commander, direction: aimVector, damage: 16, speed: 820)
            playerEnergy -= 8
            commander.fireCooldown = 0.22
        }
    }

    private func updatePlayerDrones(dt: CGFloat) {
        for drone in units where drone.team == .player && drone.kind != .commander && drone.alive {
            if let target = drone.moveTarget {
                move(unit: drone, toward: target, speed: droneSpeed(drone.kind), dt: dt)
                if distance(drone.node.position, target) < 12 { drone.moveTarget = nil }
            } else if let commander = unit(id: "pC") {
                let offset = formationOffset(for: drone.kind, player: true)
                let desired = CGPoint(x: commander.node.position.x + offset.x, y: commander.node.position.y + offset.y)
                move(unit: drone, toward: desired, speed: droneSpeed(drone.kind) * 0.72, dt: dt)
            }
            autoFire(drone)
        }
    }

    private func updateEnemyAI(dt: CGFloat) {
        guard let enemy = unit(id: "eC"), enemy.alive, let player = unit(id: "pC"), player.alive else { return }

        let core = coreNode.position
        let toCore = vector(from: enemy.node.position, to: core)
        let playerDist = distance(enemy.node.position, player.node.position)

        var desired = CGVector.zero
        if distance(enemy.node.position, core) > 110 {
            desired = normalized(toCore)
        } else {
            let phase = Int(matchTime / 2.5) % 4
            desired = phase < 2 ? CGVector(dx: 0, dy: 1) : CGVector(dx: 0, dy: -1)
        }

        if playerDist < 235 {
            let away = normalized(CGVector(dx: enemy.node.position.x - player.node.position.x, dy: enemy.node.position.y - player.node.position.y))
            desired = normalized(CGVector(dx: desired.dx + away.dx * 0.8, dy: desired.dy + away.dy * 0.8))
        }

        enemy.node.position.x += desired.dx * 235 * dt
        enemy.node.position.y += desired.dy * 235 * dt
        clampToArena(enemy.node)

        if playerDist < 650 && enemyEnergy >= 8 && enemy.fireCooldown <= 0 {
            spawnProjectile(from: enemy, direction: normalized(vector(from: enemy.node.position, to: player.node.position)), damage: 16, speed: 820)
            enemyEnergy -= 8
            enemy.fireCooldown = 0.22
        }

        if playerDist < 180 && enemyEnergy >= 24 && enemyDashCooldown <= 0 {
            let away = normalized(CGVector(dx: enemy.node.position.x - player.node.position.x, dy: enemy.node.position.y - player.node.position.y))
            enemy.node.position.x += away.dx * 140
            enemy.node.position.y += away.dy * 140
            clampToArena(enemy.node)
            enemyEnergy -= 24
            enemyDashCooldown = 2.2
        }

        for drone in units where drone.team == .enemy && drone.kind != .commander && drone.alive {
            let offset = formationOffset(for: drone.kind, player: false)
            let desiredPoint = CGPoint(x: enemy.node.position.x + offset.x, y: enemy.node.position.y + offset.y)
            move(unit: drone, toward: desiredPoint, speed: droneSpeed(drone.kind) * 0.8, dt: dt)
            autoFire(drone)
        }
    }

    private func autoFire(_ drone: CombatUnit) {
        guard drone.fireCooldown <= 0 else { return }
        let enemies = units.filter { $0.team != drone.team && $0.alive }
        let sorted = enemies.sorted {
            let d0 = distance(drone.node.position, $0.node.position)
            let d1 = distance(drone.node.position, $1.node.position)
            if abs(d0 - d1) > 0.5 { return d0 < d1 }
            return $0.id < $1.id
        }
        guard let target = sorted.first else { return }
        guard distance(drone.node.position, target.node.position) <= droneRange(drone.kind) else { return }

        spawnProjectile(from: drone, direction: normalized(vector(from: drone.node.position, to: target.node.position)), damage: droneDamage(drone.kind), speed: 670)
        drone.fireCooldown = droneCooldown(drone.kind)
    }

    private func spawnProjectile(from unit: CombatUnit, direction: CGVector, damage: CGFloat, speed: CGFloat) {
        let node = SKShapeNode(circleOfRadius: 5)
        node.position = unit.node.position
        node.strokeColor = .clear
        node.fillColor = unit.team == .player ? UIColor(red: 0.45, green: 0.9, blue: 1, alpha: 1) : UIColor(red: 1, green: 0.55, blue: 0.35, alpha: 1)
        node.zPosition = 20
        addChild(node)
        projectiles.append(Projectile(node: node, team: unit.team, velocity: CGVector(dx: direction.dx * speed, dy: direction.dy * speed), damage: damage, life: 1.4))
    }

    private func updateProjectiles(dt: CGFloat) {
        guard !projectiles.isEmpty else { return }
        for i in projectiles.indices.reversed() {
            projectiles[i].life -= dt
            projectiles[i].node.position.x += projectiles[i].velocity.dx * dt
            projectiles[i].node.position.y += projectiles[i].velocity.dy * dt

            var hit = false
            for target in units where target.team != projectiles[i].team && target.alive {
                let radius: CGFloat = target.kind == .commander ? 31 : 22
                if distance(projectiles[i].node.position, target.node.position) <= radius + 5 {
                    applyDamage(projectiles[i].damage, to: target)
                    hit = true
                    break
                }
            }

            let p = projectiles[i].node.position
            if hit || projectiles[i].life <= 0 || p.x < 36 || p.x > size.width - 36 || p.y < 36 || p.y > size.height - 36 {
                projectiles[i].node.removeFromParent()
                projectiles.remove(at: i)
            }
        }
    }

    private func applyDamage(_ amount: CGFloat, to unit: CombatUnit) {
        let multiplier: CGFloat = unit.guardRemaining > 0 ? 0.4 : 1.0
        unit.hp = max(0, unit.hp - amount * multiplier)
        updateHealthBar(unit)
        if unit.hp <= 0 {
            unit.alive = false
            unit.node.alpha = 0.18
        }
    }

    private func updateHealthBar(_ unit: CombatUnit) {
        guard let bar = unit.node.childNode(withName: "hp") as? SKShapeNode else { return }
        bar.xScale = max(0, unit.hp / unit.maxHP)
    }

    private func updateCore(dt: CGFloat) {
        guard let player = unit(id: "pC"), let enemy = unit(id: "eC") else { return }
        let playerInside = player.alive && distance(player.node.position, coreNode.position) <= 80
        let enemyInside = enemy.alive && distance(enemy.node.position, coreNode.position) <= 80

        if playerInside && !enemyInside {
            playerCore = min(coreTarget, playerCore + 14 * dt)
            enemyCore = max(0, enemyCore - 8 * dt)
        } else if enemyInside && !playerInside {
            enemyCore = min(coreTarget, enemyCore + 14 * dt)
            playerCore = max(0, playerCore - 8 * dt)
        }
    }

    private func checkVictory() {
        let playerAlive = unit(id: "pC")?.alive == true
        let enemyAlive = unit(id: "eC")?.alive == true
        if !enemyAlive || playerCore >= coreTarget {
            finish(playerWon: true)
        } else if !playerAlive || enemyCore >= coreTarget {
            finish(playerWon: false)
        }
    }

    private func finish(playerWon: Bool) {
        guard !matchOver else { return }
        matchOver = true
        firing = false
        resultLabel.text = playerWon ? "VICTORY" : "DEFEAT"
        resultLabel.fontColor = playerWon ? UIColor(red: 0.35, green: 0.9, blue: 1, alpha: 1) : UIColor(red: 1, green: 0.38, blue: 0.25, alpha: 1)
        resultLabel.isHidden = false
        hintLabel.text = playerWon ? "Enemy commander broken / Core overloaded" : "Your commander was broken / Core lost"
    }

    private func updateHUD() {
        energyLabel.text = "ENERGY  \(Int(playerEnergy))"
        energyLabel.fontColor = UIColor(red: 0.35, green: 0.9, blue: 1, alpha: 1)
        coreLabel.text = "CORE  \(Int(playerCore))  :  \(Int(enemyCore))"
        coreLabel.fontColor = UIColor(red: 0.85, green: 0.95, blue: 0.38, alpha: 1)

        dashButton.alpha = playerEnergy >= 24 && playerDashCooldown <= 0 ? 1 : 0.35
        guardButton.alpha = playerEnergy >= 30 ? 1 : 0.35

        for (id, button) in droneButtons {
            button.alpha = selectedDroneID == id ? 1 : 0.55
            button.setScale(selectedDroneID == id ? 1.12 : 1)
        }
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard !matchOver else { return }
        for touch in touches {
            let p = touch.location(in: self)

            if distance(p, moveStickBase.position) <= 90 && moveTouch == nil {
                moveTouch = touch
                updateMoveStick(touch)
                continue
            }
            if distance(p, aimStickBase.position) <= 100 && aimTouch == nil {
                aimTouch = touch
                firing = true
                updateAimStick(touch)
                continue
            }
            if distance(p, dashButton.position) <= 50 {
                performPlayerDash()
                continue
            }
            if distance(p, guardButton.position) <= 50 {
                performPlayerGuard()
                continue
            }

            var selectedButton = false
            for (id, button) in droneButtons where distance(p, button.position) <= 38 {
                selectedDroneID = selectedDroneID == id ? nil : id
                selectedButton = true
                break
            }
            if selectedButton { continue }

            if let droneID = selectedDroneID, let drone = unit(id: droneID), drone.alive, isBattlefieldPoint(p) {
                drone.moveTarget = p
                selectedDroneID = nil
            }
        }
        updateHUD()
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            if let activeMoveTouch = moveTouch, touch === activeMoveTouch { updateMoveStick(touch) }
            if let activeAimTouch = aimTouch, touch === activeAimTouch { updateAimStick(touch) }
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            if let activeMoveTouch = moveTouch, touch === activeMoveTouch {
                moveTouch = nil
                moveVector = .zero
                moveStickKnob.position = moveStickBase.position
            }
            if let activeAimTouch = aimTouch, touch === activeAimTouch {
                aimTouch = nil
                firing = false
                aimStickKnob.position = aimStickBase.position
            }
        }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        touchesEnded(touches, with: event)
    }

    private func updateMoveStick(_ touch: UITouch) {
        let p = touch.location(in: self)
        let v = vector(from: moveStickBase.position, to: p)
        let clamped = clampVector(v, length: 58)
        moveStickKnob.position = CGPoint(x: moveStickBase.position.x + clamped.dx, y: moveStickBase.position.y + clamped.dy)
        moveVector = normalized(v)
    }

    private func updateAimStick(_ touch: UITouch) {
        let p = touch.location(in: self)
        let v = vector(from: aimStickBase.position, to: p)
        let clamped = clampVector(v, length: 58)
        aimStickKnob.position = CGPoint(x: aimStickBase.position.x + clamped.dx, y: aimStickBase.position.y + clamped.dy)
        if magnitude(v) > 8 { aimVector = normalized(v) }
    }

    private func performPlayerDash() {
        guard let commander = unit(id: "pC"), commander.alive, playerEnergy >= 24, playerDashCooldown <= 0 else { return }
        var d = moveVector
        if magnitude(d) < 0.1 { d = aimVector }
        commander.node.position.x += d.dx * 140
        commander.node.position.y += d.dy * 140
        clampToArena(commander.node)
        playerEnergy -= 24
        playerDashCooldown = 2.2
    }

    private func performPlayerGuard() {
        guard let commander = unit(id: "pC"), commander.alive, playerEnergy >= 30 else { return }
        commander.guardRemaining = 1.2
        playerEnergy -= 30
    }

    private func unit(id: String) -> CombatUnit? {
        units.first { $0.id == id }
    }

    private func move(unit: CombatUnit, toward target: CGPoint, speed: CGFloat, dt: CGFloat) {
        let v = vector(from: unit.node.position, to: target)
        let d = magnitude(v)
        guard d > 1 else { return }
        let n = normalized(v)
        let step = min(speed * dt, d)
        unit.node.position.x += n.dx * step
        unit.node.position.y += n.dy * step
        clampToArena(unit.node)
    }

    private func clampToArena(_ node: SKNode) {
        node.position.x = min(max(node.position.x, 70), size.width - 70)
        node.position.y = min(max(node.position.y, 72), size.height - 72)
    }

    private func isBattlefieldPoint(_ p: CGPoint) -> Bool {
        p.x > 65 && p.x < size.width - 65 && p.y > 65 && p.y < size.height - 65
    }

    private func formationOffset(for kind: CombatUnit.Kind, player: Bool) -> CGPoint {
        let sign: CGFloat = player ? 1 : -1
        switch kind {
        case .assault: return CGPoint(x: 80 * sign, y: 105)
        case .shield: return CGPoint(x: 95 * sign, y: 0)
        case .interceptor: return CGPoint(x: 80 * sign, y: -105)
        case .commander: return .zero
        }
    }

    private func droneSpeed(_ kind: CombatUnit.Kind) -> CGFloat {
        switch kind {
        case .assault: return 205
        case .shield: return 175
        case .interceptor: return 250
        case .commander: return 0
        }
    }

    private func droneRange(_ kind: CombatUnit.Kind) -> CGFloat {
        switch kind {
        case .assault: return 430
        case .shield: return 300
        case .interceptor: return 360
        case .commander: return 0
        }
    }

    private func droneDamage(_ kind: CombatUnit.Kind) -> CGFloat {
        switch kind {
        case .assault: return 12
        case .shield: return 8
        case .interceptor: return 9
        case .commander: return 0
        }
    }

    private func droneCooldown(_ kind: CombatUnit.Kind) -> CGFloat {
        switch kind {
        case .assault: return 0.62
        case .shield: return 0.85
        case .interceptor: return 0.4
        case .commander: return 1
        }
    }

    private func vector(from a: CGPoint, to b: CGPoint) -> CGVector {
        CGVector(dx: b.x - a.x, dy: b.y - a.y)
    }

    private func distance(_ a: CGPoint, _ b: CGPoint) -> CGFloat {
        let dx = b.x - a.x
        let dy = b.y - a.y
        return (dx * dx + dy * dy).squareRoot()
    }

    private func magnitude(_ v: CGVector) -> CGFloat {
        (v.dx * v.dx + v.dy * v.dy).squareRoot()
    }

    private func normalized(_ v: CGVector) -> CGVector {
        let d = magnitude(v)
        return d > 0.0001 ? CGVector(dx: v.dx / d, dy: v.dy / d) : .zero
    }

    private func clampVector(_ v: CGVector, length maxLength: CGFloat) -> CGVector {
        let d = magnitude(v)
        guard d > maxLength, d > 0 else { return v }
        return CGVector(dx: v.dx / d * maxLength, dy: v.dy / d * maxLength)
    }
}
