import { useEffect, useRef } from "react";
import { RouterProvider } from "react-router";
import { API_URL } from "./lib/api";
import { clearLobbyId, getLobbyId, getToken } from "./lib/auth";
import { router } from "./routes";

export default function App() {
  const leaveSentRef = useRef(false);

  useEffect(() => {
    const sendLeave = () => {
      if (leaveSentRef.current) return;
      const lobbyId = getLobbyId();
      const token = getToken();
      if (!lobbyId || !token) return;
      leaveSentRef.current = true;
      clearLobbyId();
      try {
        if (navigator.sendBeacon) {
          const payload = `token=${encodeURIComponent(token)}`;
          const blob = new Blob([payload], { type: "text/plain;charset=UTF-8" });
          navigator.sendBeacon(`${API_URL}/api/lobbies/leave-beacon`, blob);
        } else {
          fetch(`${API_URL}/api/lobbies/leave`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            keepalive: true,
          });
        }
      } catch {
        // best effort
      }
    };

    window.addEventListener("pagehide", sendLeave);
    window.addEventListener("beforeunload", sendLeave);
    return () => {
      window.removeEventListener("pagehide", sendLeave);
      window.removeEventListener("beforeunload", sendLeave);
    };
  }, []);

  return <RouterProvider router={router} />;
}
