import { useEffect, useMemo, useState } from "react";
import { API_URL } from "../lib/api";

type Summary = {
  users: number;
  lobbies: number;
  lobbiesWaiting: number;
  lobbiesActive: number;
  lobbiesFinished: number;
  messages: number;
  ticketsOpen: number;
};

type LobbyInfo = {
  id: string;
  name: string;
  status: string;
  maxTeams: number;
  totalRounds: number;
  playersCount: number;
  inviteCode: string;
  createdAt: number;
  updatedAt: number;
  host: { id: number; nickname: string; email: string } | null;
  players?: Array<{
    user_id: number;
    country_id: string | null;
    nickname: string;
    avatar_emoji: string;
    email: string;
  }>;
};

type TableInfo = { name: string; rows: number };
type TableData = {
  table: string;
  columns: string[];
  rows: Array<Record<string, any>>;
  limit: number;
  offset: number;
};

const ADMIN_KEY_STORAGE = "admin_key";

const adminApi = async <T,>(
  path: string,
  adminKey: string,
  options: { method?: string; body?: any } = {}
) => {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error || "ADMIN_ERROR");
  }
  return data as T;
};

export function Admin() {
  const [adminKey, setAdminKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lobbies, setLobbies] = useState<LobbyInfo[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [tableOffset, setTableOffset] = useState(0);
  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM users LIMIT 10");
  const [sqlResult, setSqlResult] = useState<string>("");
  const [sqlUnsafe, setSqlUnsafe] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(ADMIN_KEY_STORAGE);
    if (saved) {
      setAdminKey(saved);
    }
  }, []);

  const loadAll = async (key: string) => {
    setLoading(true);
    setError("");
    try {
      const [summaryRes, lobbiesRes, tablesRes] = await Promise.all([
        adminApi<{ summary: Summary }>("/api/admin/summary", key),
        adminApi<{ lobbies: LobbyInfo[] }>("/api/admin/lobbies?includePlayers=1", key),
        adminApi<{ tables: TableInfo[] }>("/api/admin/tables", key),
      ]);
      setSummary(summaryRes.summary);
      setLobbies(lobbiesRes.lobbies);
      setTables(tablesRes.tables);
      setConnected(true);
      localStorage.setItem(ADMIN_KEY_STORAGE, key);
    } catch (err: any) {
      setError(err?.message || "Ошибка подключения");
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const loadTable = async (name: string, offset = 0) => {
    if (!adminKey) return;
    setLoading(true);
    setError("");
    try {
      const data = await adminApi<TableData>(
        `/api/admin/table/${encodeURIComponent(name)}?limit=50&offset=${offset}`,
        adminKey
      );
      setTableData(data);
      setSelectedTable(name);
      setTableOffset(offset);
    } catch (err: any) {
      setError(err?.message || "Ошибка загрузки таблицы");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRow = async (rowid: number) => {
    if (!selectedTable) return;
    try {
      await adminApi(
        `/api/admin/table/${encodeURIComponent(selectedTable)}/${rowid}`,
        adminKey,
        { method: "DELETE" }
      );
      await loadTable(selectedTable, tableOffset);
    } catch (err: any) {
      setError(err?.message || "Ошибка удаления");
    }
  };

  const handleFinishLobby = async (lobbyId: string) => {
    try {
      await adminApi(`/api/admin/lobbies/${lobbyId}/finish`, adminKey, {
        method: "POST",
      });
      await loadAll(adminKey);
    } catch (err: any) {
      setError(err?.message || "Ошибка завершения лобби");
    }
  };

  const handleDeleteLobby = async (lobbyId: string) => {
    try {
      await adminApi(`/api/admin/lobbies/${lobbyId}`, adminKey, {
        method: "DELETE",
      });
      await loadAll(adminKey);
    } catch (err: any) {
      setError(err?.message || "Ошибка удаления лобби");
    }
  };

  const handleRunSql = async () => {
    if (!adminKey || !sqlQuery.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await adminApi<any>("/api/admin/sql", adminKey, {
        method: "POST",
        body: { query: sqlQuery, unsafe: sqlUnsafe },
      });
      setSqlResult(JSON.stringify(result, null, 2));
    } catch (err: any) {
      setError(err?.message || "Ошибка SQL");
    } finally {
      setLoading(false);
    }
  };

  const tableColumns = useMemo(() => {
    if (!tableData) return [];
    return tableData.columns;
  }, [tableData]);

  return (
    <div
      className="min-h-screen"
      style={{
        background: "var(--app-bg-gradient)",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <div className="text-2xl font-bold text-white">Админ-панель</div>
            <div className="text-sm text-white/50">
              Управление базой данных, лобби и сервисами
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="ADMIN_KEY"
              className="rounded-[10px] px-3 py-2 text-sm text-white"
              style={{
                background: "var(--app-input)",
                border: "1px solid rgba(255,255,255,0.1)",
                outline: "none",
              }}
            />
            <button
              onClick={() => loadAll(adminKey)}
              className="rounded-[10px] px-4 py-2 text-sm font-bold text-white"
              style={{ background: "var(--app-success)" }}
              disabled={!adminKey || loading}
            >
              Подключиться
            </button>
          </div>
        </div>

        {error && (
          <div
            className="rounded-[12px] px-4 py-3 mb-4 text-sm"
            style={{
              background: "color-mix(in srgb, var(--app-danger) 18%, transparent)",
              color: "var(--app-danger)",
            }}
          >
            {error}
          </div>
        )}

        {!connected ? (
          <div
            className="rounded-[16px] p-6 text-white/70"
            style={{ background: "var(--app-surface-strong)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Введите ключ администратора, чтобы открыть панель.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              {summary && [
                { label: "Пользователи", value: summary.users },
                { label: "Лобби (всего)", value: summary.lobbies },
                { label: "Идут игры", value: summary.lobbiesActive },
                { label: "Открытые тикеты", value: summary.ticketsOpen },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-[14px] p-4"
                  style={{ background: "var(--app-surface)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="text-xs text-white/50 mb-1">{card.label}</div>
                  <div className="text-2xl font-bold text-white">{card.value}</div>
                </div>
              ))}
            </div>

            <div
              className="rounded-[16px] p-5"
              style={{ background: "var(--app-surface-strong)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-bold text-white">Лобби</div>
                <button
                  onClick={() => loadAll(adminKey)}
                  className="text-xs px-3 py-2 rounded-[10px] text-white"
                  style={{
                    background: "color-mix(in srgb, var(--app-accent) 18%, var(--app-input))",
                  }}
                >
                  Обновить
                </button>
              </div>
              <div className="space-y-3">
                {lobbies.map((lobby) => (
                  <div
                    key={lobby.id}
                    className="rounded-[12px] p-4 flex flex-col gap-3"
                    style={{ background: "var(--app-input)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-white">{lobby.name}</div>
                        <div className="text-xs text-white/50">
                          ID: {lobby.id} · Статус: {lobby.status}
                        </div>
                        <div className="text-xs text-white/50">
                          Игроков: {lobby.playersCount}/{lobby.maxTeams} · Раундов: {lobby.totalRounds}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleFinishLobby(lobby.id)}
                          className="px-3 py-2 text-xs rounded-[10px] text-white"
                          style={{ background: "var(--app-accent)" }}
                        >
                          Завершить
                        </button>
                        <button
                          onClick={() => handleDeleteLobby(lobby.id)}
                          className="px-3 py-2 text-xs rounded-[10px] text-white"
                          style={{ background: "var(--app-danger)" }}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                    {lobby.players && lobby.players.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {lobby.players.map((player) => (
                          <div
                            key={player.user_id}
                            className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-xs text-white/80"
                            style={{
                              background: "color-mix(in srgb, var(--app-input) 70%, var(--app-surface))",
                            }}
                          >
                            <span>{player.avatar_emoji}</span>
                            <span>{player.nickname}</span>
                            <span className="text-white/40">{player.country_id || "—"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {lobbies.length === 0 && (
                  <div className="text-sm text-white/50">Лобби не найдены.</div>
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <div
                className="rounded-[16px] p-4"
                style={{ background: "var(--app-surface-strong)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="text-sm font-bold text-white mb-3">Таблицы</div>
                <div className="space-y-2">
                  {tables.map((table) => (
                    <button
                      key={table.name}
                      onClick={() => loadTable(table.name, 0)}
                      className="w-full text-left rounded-[10px] px-3 py-2 text-xs"
                      style={{
                        background:
                          selectedTable === table.name
                            ? "color-mix(in srgb, var(--app-accent) 18%, var(--app-input))"
                            : "var(--app-input)",
                        color: "white",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      {table.name}{" "}
                      <span className="text-white/50">({table.rows})</span>
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="rounded-[16px] p-4"
                style={{ background: "var(--app-surface-strong)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold text-white">
                    {selectedTable ? `Таблица: ${selectedTable}` : "Данные таблицы"}
                  </div>
                  {selectedTable && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadTable(selectedTable, Math.max(tableOffset - 50, 0))}
                        className="px-3 py-2 text-xs rounded-[10px] text-white"
                        style={{
                          background: "color-mix(in srgb, var(--app-accent) 18%, var(--app-input))",
                        }}
                      >
                        Назад
                      </button>
                      <button
                        onClick={() => loadTable(selectedTable, tableOffset + 50)}
                        className="px-3 py-2 text-xs rounded-[10px] text-white"
                        style={{
                          background: "color-mix(in srgb, var(--app-accent) 18%, var(--app-input))",
                        }}
                      >
                        Вперёд
                      </button>
                    </div>
                  )}
                </div>
                {!tableData ? (
                  <div className="text-sm text-white/50">
                    Выберите таблицу слева.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-white">
                      <thead>
                        <tr>
                          {tableColumns.map((col) => (
                            <th key={col} className="text-left px-2 py-2 text-white/70">
                              {col}
                            </th>
                          ))}
                          <th className="px-2 py-2 text-white/70">Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.rows.map((row) => (
                          <tr key={row._rowid} className="border-t border-white/5">
                            {tableColumns.map((col) => (
                              <td key={`${row._rowid}-${col}`} className="px-2 py-2">
                                {row[col] === null || row[col] === undefined
                                  ? "—"
                                  : typeof row[col] === "object"
                                    ? JSON.stringify(row[col])
                                    : String(row[col])}
                              </td>
                            ))}
                            <td className="px-2 py-2">
                              <button
                                onClick={() => handleDeleteRow(row._rowid)}
                                className="px-2 py-1 rounded-[8px] text-xs text-white"
                                style={{ background: "var(--app-danger)" }}
                              >
                                Удалить
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div
              className="rounded-[16px] p-4"
              style={{ background: "var(--app-surface-strong)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="text-sm font-bold text-white mb-3">SQL-консоль</div>
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                className="w-full h-28 rounded-[10px] p-3 text-xs text-white"
                style={{
                  background: "var(--app-input)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  outline: "none",
                }}
              />
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <button
                  onClick={handleRunSql}
                  className="px-3 py-2 rounded-[10px] text-xs font-bold text-white"
                  style={{ background: "var(--app-accent)" }}
                >
                  Выполнить
                </button>
                <label className="text-xs text-white/70 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sqlUnsafe}
                    onChange={(e) => setSqlUnsafe(e.target.checked)}
                  />
                  Разрешить изменение данных
                </label>
              </div>
              {sqlResult && (
                <pre
                  className="mt-3 text-xs text-white/80 rounded-[10px] p-3 overflow-auto"
                  style={{ background: "var(--app-surface)" }}
                >
                  {sqlResult}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

