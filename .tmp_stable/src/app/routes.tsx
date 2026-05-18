import { createBrowserRouter } from "react-router";
import { Home } from "./pages/Home";
import { Register } from "./pages/Register";
import { Login } from "./pages/Login";
import { Lobby } from "./pages/Lobby";
import { Game } from "./pages/Game";
import { Victory } from "./pages/Victory";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Home,
  },
  {
    path: "/register",
    Component: Register,
  },
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/lobby",
    Component: Lobby,
  },
  {
    path: "/game",
    Component: Game,
  },
  {
    path: "/victory",
    Component: Victory,
  },
]);