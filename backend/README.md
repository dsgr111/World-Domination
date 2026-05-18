# Backend для "Мирового господства"

Полностью рабочий backend на Node.js + Express + Socket.IO + SQLite.

## Запуск

1. `cd backend`
2. `npm install`
3. `npm run dev`

По умолчанию сервер стартует на `http://localhost:4000`.

Если вы хотите запускать фронт и бэк на одном хосте, соберите фронт и запускайте только backend:
1. В корне проекта: `npm run build`
2. В `backend/`: `npm run dev` или `npm run start`
3. Открывайте `http://localhost:4000`

## Конфигурация

Скопируйте `backend/.env.example` в `backend/.env` и при необходимости измените параметры.

Основные переменные:
- `PORT` — порт backend
- `APP_BASE_URL` — базовый URL фронта для генерации invite-ссылок (для режима одного хоста — `http://localhost:4000`)
- `JWT_SECRET` — секрет JWT
- `DISCUSSION_MS`, `DECISIONS_MS`, `SUMMARY_MS` — тайминги фаз
- `START_MONEY`, `NUKE_COST`, `NUKE_UNLOCK_ROUND` — экономика

## Ключевые правила игры

- 2–10 команд.
- Раунды задаются при создании лобби.
- 20 стран, у каждой по 3 города.
- 2 минуты — общее обсуждение (глобальный чат).
- 5 минут — решения и переговоры.
- Ядерное оружие доступно с 3 раунда.
- Щит защищает от 1 бомбы.
- В конце каждого раунда отдается summary по изменению уровня жизни.

## REST API (основные)

Auth:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

Profile:
- `PATCH /api/profile`

Friends:
- `GET /api/friends`
- `GET /api/friends/requests`
- `GET /api/friends/search?q=Nick`
- `POST /api/friends/request`
- `POST /api/friends/accept`
- `POST /api/friends/decline`

Support:
- `POST /api/support/tickets`
- `GET /api/support/tickets`

Lobbies:
- `GET /api/lobbies`
- `POST /api/lobbies`
- `POST /api/lobbies/join`
- `POST /api/lobbies/leave`
- `GET /api/lobbies/:id`
- `POST /api/lobbies/:id/select-country`
- `POST /api/lobbies/:id/start`

Game:
- `GET /api/game/:lobbyId/state`
- `POST /api/game/:lobbyId/decisions/draft`
- `POST /api/game/:lobbyId/decisions/confirm`

Negotiations:
- `GET /api/game/:lobbyId/negotiations`
- `POST /api/game/:lobbyId/negotiations/request`
- `POST /api/game/:lobbyId/negotiations/:id/accept`
- `POST /api/game/:lobbyId/negotiations/:id/reject`
- `POST /api/game/:lobbyId/negotiations/:id/end`

Config:
- `GET /api/config`

## Socket.IO события

Подключение:
- auth: `{ token }` (JWT)

События клиента:
- `lobby:join` — подключиться к комнате лобби
- `chat:global` — сообщение в общий чат
- `chat:private` — личное сообщение по стране
- `negotiation:join` — подключиться к чату переговоров
- `chat:negotiation` — сообщение в переговоры

События сервера:
- `game:started`
- `game:update`
- `game:phase`
- `game:round-summary`
- `game:finished`
- `chat:global`
- `chat:private`
- `chat:negotiation`
- `negotiation:request`
- `negotiation:accepted`

## Примечания

- Бомбы анонимны: в событиях нет информации о нападающем.
- Экономика рассчитывается на сервере и возвращается вместе со state (доходы, цены на щиты и апгрейды).
