import { Outlet } from "react-router";
import { GlobalOverlays } from "./components/GlobalOverlays";
import { ShaderBackground } from "./components/ShaderBackground";

export function RootLayout() {
  return (
    <>
      <ShaderBackground />
      <div className="relative z-10 min-h-screen">
        <Outlet />
        <GlobalOverlays />
      </div>
    </>
  );
}
