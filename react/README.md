# My Collection — Frontend (React + Vite)

스포츠/트레이딩 카드 컬렉션 포트폴리오 관리 앱의 프론트엔드.
대시보드, 컬렉션 관리, 갤러리 전시, 카드 상세, 환경설정을 제공하는 SPA입니다.

> 백엔드 API 서버는 별도 브랜치(`backend`)에 있습니다.

## 기술 스택
- **React 18** + **Vite 5**
- **Tailwind CSS 3** + **Radix UI** (shadcn 스타일 프리미티브)
- **React Router 6**

## 시작하기
```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173)
npm run build      # 프로덕션 빌드 → dist/
npm run preview    # 빌드 결과 미리보기
```
> 백엔드 API 서버(기본 `http://localhost:4000`)가 함께 실행 중이어야 데이터가 표시됩니다.

## API 베이스 설정
백엔드 주소는 `src/api.js`의 `getApiBase()`가 다음 우선순위로 결정합니다.
1. URL 쿼리 파라미터 `?apiBase=<url>` (지정 시 `sessionStorage`에 저장)
2. `sessionStorage`에 저장된 값
3. 기본값 `http://localhost:4000`

ngrok 등으로 외부에서 시연할 때는 배포된 프론트 URL에 `?apiBase=<백엔드-공개-URL>`을 붙여 엽니다.
```text
https://<your-host>/?apiBase=https://xxxx.ngrok-free.app
```

> 백엔드에 `API_TOKEN`이 설정되어 쓰기 보호가 켜진 경우, 쓰기 요청에는 토큰이 필요합니다.
> 현재 프론트의 토큰 전달은 미연동 상태(추후 작업)이며, 읽기/조회는 토큰 없이 동작합니다.

## 에러 처리
- `src/api.js`의 **`apiJson()`** 헬퍼가 HTTP 4xx/5xx·네트워크 오류 시 `ApiError`를 throw 합니다.
- 주요 페이지(Dashboard·Collection·Gallery)는 로드 실패를 **에러 배너 + 다시 시도**로 표시하며,
  "데이터 없음"과 "불러오기 실패"를 구분합니다.

## 페이지 구성
| 경로 | 페이지 | 설명 |
|------|--------|------|
| `/dashboard` | Dashboard | 포트폴리오 요약·추이 차트·Top Performers |
| `/collection` | Collection | 카드 목록/검색/필터, 수동·PSA 자동 등록 |
| `/collection/:id` | CardDetail | 카드 상세, 시세 이력, 시세 수집 |
| `/gallery` | Gallery | 프레임 섹션 큐레이션·전시(3D 틸트) |
| `/settings` | Settings | 통화·정렬·테마 등 환경설정 |
| `/llm-test` | LlmTest | LLM 챗 테스트(실험적) |

## 디렉터리
```
src/
  main.jsx, App.jsx        # 엔트리 / 라우트
  api.js                   # API 클라이언트(apiFetch, apiJson, ApiError)
  pages/                   # 페이지 컴포넌트
  components/              # 공용 컴포넌트 + ui/ (Radix 기반 프리미티브)
  contexts/                # PreferencesContext(전역 설정/테마)
  hooks/, lib/             # 커스텀 훅 / 유틸(차트·등급·classname)
vite.config.js             # @ → ./src 별칭, dev 포트 5173
```
