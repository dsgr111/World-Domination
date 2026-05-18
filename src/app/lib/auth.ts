export interface AuthUser {
  id: number;
  email: string;
  nickname: string;
  avatar_emoji: string;
}

const TOKEN_KEY = "wd_token";
const USER_KEY = "wd_user";
const LOBBY_KEY = "wd_lobby";
const IN_LOBBY_KEY = "wd_in_lobby";
const IN_GAME_KEY = "wd_in_game";
const REMEMBER_KEY = "wd_remember";

const readStorage = (key: string) => {
  return localStorage.getItem(key) ?? sessionStorage.getItem(key);
};

const getStorage = () => {
  const remember = localStorage.getItem(REMEMBER_KEY) === "1";
  return remember ? localStorage : sessionStorage;
};

export const saveAuth = (token: string, user: AuthUser, remember = true) => {
  clearAuth();
  const storage = remember ? localStorage : sessionStorage;
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, "1");
  } else {
    sessionStorage.setItem(REMEMBER_KEY, "0");
  }
  storage.setItem(TOKEN_KEY, token);
  storage.setItem(USER_KEY, JSON.stringify(user));
};

export const getAuth = () => {
  const token = readStorage(TOKEN_KEY);
  const userRaw = readStorage(USER_KEY);
  if (!token || !userRaw) return null;
  try {
    const user = JSON.parse(userRaw) as AuthUser;
    return { token, user };
  } catch {
    return null;
  }
};

export const getToken = () => readStorage(TOKEN_KEY);

export const getUser = () => {
  const raw = readStorage(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};

export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LOBBY_KEY);
  localStorage.removeItem(IN_LOBBY_KEY);
  localStorage.removeItem(IN_GAME_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(LOBBY_KEY);
  sessionStorage.removeItem(IN_LOBBY_KEY);
  sessionStorage.removeItem(IN_GAME_KEY);
  sessionStorage.removeItem(REMEMBER_KEY);
};

export const setLobbyId = (lobbyId: string) => {
  getStorage().setItem(LOBBY_KEY, lobbyId);
};

export const getLobbyId = () => {
  return readStorage(LOBBY_KEY);
};

export const clearLobbyId = () => {
  localStorage.removeItem(LOBBY_KEY);
  sessionStorage.removeItem(LOBBY_KEY);
};

export const setInLobby = (value: boolean) => {
  getStorage().setItem(IN_LOBBY_KEY, value ? "1" : "0");
};

export const getInLobby = () => {
  return readStorage(IN_LOBBY_KEY) === "1";
};

export const setInGame = (value: boolean) => {
  getStorage().setItem(IN_GAME_KEY, value ? "1" : "0");
};

export const getInGame = () => {
  return readStorage(IN_GAME_KEY) === "1";
};
