import { Link } from "react-router-dom";

export default function MarketTrends() {
  return (
    <div
      className="glass-card"
      style={{ padding: "48px", textAlign: "center" }}
    >
      <div className="icon-box" style={{ margin: "0 auto 16px" }}>
        <i className="ri-line-chart-line text-2xl text-gold"></i>
      </div>
      <h3
        className="font-poppins font-bold text-2xl"
        style={{ marginBottom: "10px" }}
      >
        Market Trends — React 포팅 예정
      </h3>
      <p className="text-sm text-muted">
        기존 market-trends.html에서 React로 이전 작업이 진행 중입니다.
      </p>
      <div
        style={{
          marginTop: "20px",
          display: "flex",
          justifyContent: "center",
          gap: "10px",
        }}
      >
        <Link className="btn-secondary" to="/dashboard">
          Dashboard로
        </Link>
      </div>
    </div>
  );
}
