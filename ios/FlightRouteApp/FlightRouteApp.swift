import SwiftUI
import KakaoMapsSDK

@main
struct FlightRouteApp: App {
    init() {
        if let key = Bundle.main.object(forInfoDictionaryKey: "KAKAO_NATIVE_APP_KEY") as? String,
           !key.isEmpty,
           key != "YOUR_KAKAO_NATIVE_APP_KEY" {
            SDKInitializer.InitSDK(key)
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .ignoresSafeArea()
        }
    }
}

struct ContentView: View {
    @State private var drawMap = false

    var body: some View {
        KakaoNativeMapView(draw: $drawMap)
            .onAppear { drawMap = true }
            .onDisappear { drawMap = false }
            .ignoresSafeArea()
    }
}
