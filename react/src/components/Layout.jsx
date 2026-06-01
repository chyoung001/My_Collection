import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Header from "./Header.jsx";

export default function Layout() {
  return (
    <>
      <Sidebar />
      <div className="ml-[240px] flex-1 flex flex-col max-[820px]:ml-0">
        <Header />
        <main className="p-8">
          <Outlet />
        </main>
      </div>
    </>
  );
}
