import SwiftUI
import UIKit
import KakaoMapsSDK

struct KakaoNativeMapView: UIViewRepresentable {
    @Binding var draw: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> KMViewContainer {
        let container = KMViewContainer(frame: .zero)
        context.coordinator.start(container: container)
        return container
    }

    func updateUIView(_ uiView: KMViewContainer, context: Context) {
        if draw {
            context.coordinator.activate()
        } else {
            context.coordinator.pause()
        }
    }

    static func dismantleUIView(_ uiView: KMViewContainer, coordinator: Coordinator) {
        coordinator.stop()
    }

    final class Coordinator: NSObject, MapControllerDelegate {
        private var controller: KMController?
        private weak var container: KMViewContainer?

        func start(container: KMViewContainer) {
            self.container = container
            let controller = KMController(viewContainer: container)
            self.controller = controller
            controller.delegate = self
            _ = controller.prepareEngine()
            controller.activateEngine()
        }

        func activate() {
            controller?.activateEngine()
        }

        func pause() {
            controller?.pauseEngine()
        }

        func stop() {
            controller?.pauseEngine()
            controller?.resetEngine()
            controller = nil
        }

        func addViews() {
            let start = MapPoint(longitude: 126.84, latitude: 35.16)
            let info = MapviewInfo(
                viewName: "mapview",
                viewInfoName: "map",
                defaultPosition: start,
                defaultLevel: 8
            )
            controller?.addView(info)
        }

        func addViewSucceeded(_ viewName: String, viewInfoName: String) {
            guard viewName == "mapview",
                  let map = controller?.getView("mapview") as? KakaoMap else { return }

            if let size = container?.bounds.size, size.width > 0, size.height > 0 {
                map.viewRect = CGRect(origin: .zero, size: size)
            }

            // KakaoMapsSDK의 네이티브 회전 제스처는 기본 지도 제스처로 처리됨.
            // SDK 내장 나침반을 표시하고 우측 하단(현재 위치 버튼 위쪽)에 배치.
            map.showCompass()
            map.setCompassPosition(
                origin: .bottomRight,
                position: CGPoint(x: -14, y: -116)
            )
        }

        func addViewFailed(_ viewName: String, viewInfoName: String) {
            print("KakaoMap view creation failed: \(viewName) / \(viewInfoName)")
        }

        func containerDidResized(_ size: CGSize) {
            guard let map = controller?.getView("mapview") as? KakaoMap else { return }
            map.viewRect = CGRect(origin: .zero, size: size)
        }

        func viewWillDestroyed(_ view: ViewBase) {}
    }
}
