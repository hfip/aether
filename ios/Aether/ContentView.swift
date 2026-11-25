import SwiftUI

struct ContentView: View {
    @StateObject private var model = WebViewModel()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            WebView(model: model)
                .ignoresSafeArea()
            if model.isLoading {
                ProgressView()
                    .tint(.white)
                    .scaleEffect(1.2)
            }
        }
    }
}

#Preview {
    ContentView()
}
