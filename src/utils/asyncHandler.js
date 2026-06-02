// async 라우트 핸들러용 래퍼.
//
// Express 4는 async 핸들러가 반환한 reject된 Promise를 자동으로 잡지 못한다.
// 핸들러 안의 await가 try/catch 없이 reject되면, 응답이 전송되지 않아 요청이 그대로
// 멈춘다(hang) — 클라이언트는 500조차 못 받고 자기 타임아웃까지 대기한다.
//
// 이 래퍼는 그 reject를 next(err)로 흘려보내 server.js의 전역 에러 핸들러가
// 표준 JSON 봉투({error, message})로 응답하도록 한다.
//
// 사용: router.post("/path", asyncHandler(async (req, res) => { ... }))
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
