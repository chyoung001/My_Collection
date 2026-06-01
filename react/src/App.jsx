import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Collection from "./pages/Collection.jsx";
import CardDetail from "./pages/CardDetail.jsx";
import Gallery from "./pages/Gallery.jsx";
import MarketTrends from "./pages/MarketTrends.jsx";
import Settings from "./pages/Settings.jsx";
import Hidden from "./pages/Hidden.jsx";
import LlmTest from "./pages/LlmTest.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/collection" element={<Collection />} />
        <Route path="/collection/:id" element={<CardDetail />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/market-trends" element={<MarketTrends />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/hidden" element={<Hidden />} />
        <Route path="/llm-test" element={<LlmTest />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
