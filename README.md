# My Collection — Backend API

스포츠/트레이딩 카드 컬렉션 포트폴리오 관리 API 서버.
PSA 인증조회 자동 등록, 130point 기반 시세 수집, 갤러리 큐레이션, 대시보드 집계를 제공합니다.

> 프론트엔드는 별도 브랜치(`frontend`)에 있습니다.

## 기술 스택
- **Node.js / Express 4** (ESM)
- **PostgreSQL** (`pg`)
- 외부 연동: PSA Public API · 130point.com(ZenRows 프록시) · Ollama Cloud(OpenAI 호환 SDK)
- API 문서: `swagger-ui-express` (`/docs`)

## 시작하기

### 1) 의존성 설치
```bash
npm install
```

### 2) 환경변수 설정
`.env.example`을 복사해 값을 채웁니다.
```bash
cp .env.example .env     # Windows: copy .env.example .env
```
- `DATABASE_URL` (필수) — 없으면 부팅 즉시 종료
- `API_TOKEN` — 설정하면 쓰기/비용 엔드포인트 보호가 켜짐(아래 "인증" 참고)
- 그 외 PSA/ZenRows/Ollama 키 등은 `.env.example` 주석 참고

### 3) 데이터베이스
스키마는 **서버 부팅 시 자동 마이그레이션**(`migrate()` in `src/server.js`)으로 멱등하게 생성됩니다.
수동 적용이 필요하면 동일 내용의 `schema.sql`을 직접 실행할 수도 있습니다.
```bash
psql "$DATABASE_URL" -f schema.sql
```

### 4) 실행
```bash
npm start        # 운영
npm run dev      # 개발 (NODE_ENV=development)
```
기본 포트 `4000`. 헬스체크: `GET /health`, API 문서: `GET /docs`.

## 인증 / 레이트리밋
단일 사용자 앱 기준의 공유 토큰 인증입니다.
- **읽기(GET/HEAD/OPTIONS)** — 공개
- **쓰기(POST/PATCH/DELETE)와 비용 호출(스크래핑·LLM)** — `Authorization: Bearer <API_TOKEN>` 또는 `X-Api-Token` 헤더 필요
- `API_TOKEN` 미설정 시: 개발 환경은 통과(경고), `NODE_ENV=production`은 503으로 차단(fail-closed)
- 모든 `/api`에 IP당 분당 300회, LLM 라우트는 분당 20회 레이트리밋

토큰 생성 예:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 주요 엔드포인트
| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|:----:|
| GET | `/api/cards` | 카드 목록(최신순, 최대 200) | — |
| GET | `/api/cards/:id` | 카드 단건 | — |
| POST | `/api/cards` | 수동 등록 | 🔒 |
| POST | `/api/cards/auto` | PSA 인증번호 자동 등록 | 🔒 |
| DELETE | `/api/cards/:id` | 삭제 | 🔒 |
| PATCH | `/api/cards/:id/{purchase-price,rare-flag,section,image}` | 필드 수정 | 🔒 |
| GET | `/api/dashboard/{summary,top-cards,top-gainer}` | 대시보드 집계 | — |
| GET | `/api/snapshots/{summary,latest}` · `/:cardId/history` | 시세 조회 | — |
| POST | `/api/snapshots/:cardId/fetch` | 시세 수집(ZenRows) | 🔒💰 |
| GET/POST/PATCH/DELETE | `/api/gallery/sections...` | 갤러리 큐레이션 | 쓰기 🔒 |
| GET/PATCH | `/api/preferences` · `/api/preferences/health` | 환경설정 | 쓰기 🔒 |
| POST | `/api/llm-test/{chat,stream}` | LLM 테스트(실험적) | 🔒💰 |
| GET | `/health` · `/docs` | 헬스체크 · Swagger UI | — |

(🔒 토큰 필요 · 💰 외부 유료 호출 발생)

## 배포 (Railway)
`railway.json`이 `NIXPACKS` 빌더 + `npm start`로 구성되어 있습니다.
배포 환경에는 최소 `DATABASE_URL`, `API_TOKEN`, `NODE_ENV=production`, `ALLOWED_ORIGINS`(프론트 출처)를 환경변수로 설정하세요.

## 디렉터리
```
src/
  server.js          # 부트스트랩, 미들웨어, 라우터 마운트, 자동 마이그레이션
  service/           # 라우터(cards, dashboard, snapshots, gallery, preferences, llmTest)
  utils/             # db, auth, rateLimit, httpError, psaClient, zenrowsClient, pointScraper, ollamaClient ...
schema.sql           # migrate()와 동일한 스키마 참고본
scripts/             # 보조 스크립트(ollama:ping 등)
```
