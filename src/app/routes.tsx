import { createBrowserRouter } from "react-router";
import { RootLayout } from "./RootLayout";
import { Home } from "./pages/Home";
import { Register } from "./pages/Register";
import { Login } from "./pages/Login";
import { Lobby } from "./pages/Lobby";
import { Game } from "./pages/Game";
import { Victory } from "./pages/Victory";
import { Admin } from "./pages/Admin";
import { Welcome } from "./pages/Welcome";
import { Profile } from "./pages/Profile";
import { Friends } from "./pages/Friends";
import { Settings } from "./pages/Settings";
import { VerifyEmail } from "./pages/VerifyEmail";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      {
        index: true,
        Component: Home,
      },
      {
        path: "register",
        Component: Register,
      },
      {
        path: "login",
        Component: Login,
      },
      {
        path: "verify-email",
        Component: VerifyEmail,
      },
      {
        path: "welcome",
        Component: Welcome,
      },
      {
        path: "lobby",
        Component: Lobby,
      },
      {
        path: "profile",
        Component: Profile,
      },
      {
        path: "profile/:id",
        Component: Profile,
      },
      {
        path: "friends",
        Component: Friends,
      },
      {
        path: "settings",
        Component: Settings,
      },
      {
        path: "game",
        Component: Game,
      },
      {
        path: "victory",
        Component: Victory,
      },
      {
        path: "admin",
        Component: Admin,
      },
    ],
  },
]);
