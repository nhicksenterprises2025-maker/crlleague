import SwiftUI
import SpriteKit

@main
struct LockstepApp: App {
    var body: some Scene {
        WindowGroup {
            GameContainerView()
                .persistentSystemOverlays(.hidden)
                .statusBarHidden(true)
        }
    }
}

struct GameContainerView: View {
    private let scene: GameScene = {
        let scene = GameScene(size: CGSize(width: 1366, height: 768))
        scene.scaleMode = .aspectFill
        return scene
    }()

    var body: some View {
        SpriteView(scene: scene, options: [.ignoresSiblingOrder])
            .ignoresSafeArea()
            .background(Color.black)
    }
}
