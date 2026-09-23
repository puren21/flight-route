# 비행경로 iPhone 네이티브 지도 시험판

이 폴더는 기존 GitHub Pages 웹사이트와 별도로, iPhone에서 KakaoMapsSDK v2의 네이티브 지도 회전을 시험하기 위한 최소 프로젝트 소스입니다.

## 구현된 내용

- iOS 13 이상
- KakaoMapsSDK v2 사용
- iPhone 네이티브 지도
- SDK 기본 두 손가락 회전 제스처 사용
- SDK 내장 나침반 표시
- 나침반을 우측 하단에 배치
- 정북 복귀는 SDK 내장 나침반 동작 사용
- 초기 중심: 35.16, 126.84
- 초기 레벨: 8

## 실행 준비

1. Mac의 Xcode에서 프로젝트를 생성하거나 XcodeGen으로 이 폴더의 project.yml을 프로젝트로 변환합니다.
2. Swift Package Manager가 KakaoMapsSDK를 추가합니다.
3. Kakao Developers에서 네이티브 앱 키를 발급합니다.
4. Kakao Developers에 실제 Bundle Identifier를 등록합니다.
5. Info.plist의 YOUR_KAKAO_NATIVE_APP_KEY를 실제 네이티브 앱 키로 교체합니다.
6. 실제 iPhone에서 실행해 두 손가락 회전을 확인합니다.

XcodeGen을 사용하는 경우:

    cd ios
    xcodegen generate
    open FlightRoute.xcodeproj

주의: 현재 웹사이트의 경로 목록, 메모, GeoJSON 라인 등의 모든 기능을 이 네이티브 지도에 아직 이식한 것은 아닙니다. 우선 회전과 나침반이 실제 iPhone에서 안정적으로 동작하는지 검증하기 위한 시험판입니다.
