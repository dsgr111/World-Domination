export const INVITE_PREFIX = "INVITE::";

declare global {
  interface Window {
    __wd_global_invites?: boolean;
  }
}

export const setGlobalInviteHandler = (active: boolean) => {
  if (typeof window === "undefined") return;
  window.__wd_global_invites = active;
};

export const isGlobalInviteHandler = () => {
  if (typeof window === "undefined") return false;
  return Boolean(window.__wd_global_invites);
};

export interface LobbyInvitePayload {
  type: "lobby_invite";
  lobbyId: string;
  lobbyName?: string;
  inviteCode: string;
  inviterId?: number;
  inviterNickname?: string;
  inviterAvatar?: string;
  createdAt?: number;
}

export const parseLobbyInvite = (content: string): LobbyInvitePayload | null => {
  if (typeof content !== "string") return null;
  if (!content.startsWith(INVITE_PREFIX)) return null;
  const raw = content.slice(INVITE_PREFIX.length);
  try {
    const parsed = JSON.parse(raw) as LobbyInvitePayload;
    if (!parsed || parsed.type !== "lobby_invite" || !parsed.lobbyId || !parsed.inviteCode) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};
