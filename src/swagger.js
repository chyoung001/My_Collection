import swaggerJSDoc from "swagger-jsdoc";

// 환경별 server URL.
// PUBLIC_API_BASE_URL이 설정되어 있으면 (배포 환경) 그것을 사용,
// 아니면 로컬 개발용 상대 경로 기본값.
const servers = [];
if (process.env.PUBLIC_API_BASE_URL) {
  servers.push({ url: process.env.PUBLIC_API_BASE_URL, description: "Production" });
}
servers.push({ url: `http://localhost:${process.env.PORT || 4000}`, description: "Local" });

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "My Collection API",
      version: "0.1.0",
      description: "카드 컬렉션 / 포트폴리오 요약 / PSA Cert 조회용 API",
    },
    servers,
  },

  apis: ["./src/service/*.js"],
};

export const swaggerSpec = swaggerJSDoc(options);