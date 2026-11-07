# seminario-be

Backend para una presentación interactiva: los asistentes responden encuestas desde su celular, la pantalla general muestra los resultados en tiempo real y un administrador controla de forma remota qué ve cada uno.

Stack: NestJS · MongoDB (Mongoose) · Socket.IO

## Puesta en marcha

```bash
cp .env.example .env        # completa MONGODB_* (Atlas) y ADMIN_API_KEY
# para MongoDB local: docker compose up -d mongo y MONGODB_URI=mongodb://localhost:27017
npm install
npm run start:dev
```

API REST en `http://localhost:3000/api`; WebSocket en el namespace `/live`.

## Estructura

```
src/
├── config/          variables de entorno
├── common/          guard de admin, filtro de errores WS, nombres de eventos internos
├── surveys/         encuestas y sus preguntas (single, multiple, scale, text)
├── presentations/   sala en vivo: código de acceso + estado controlado por el admin
├── responses/       votos de los participantes (1 doc por participante y pregunta)
├── analytics/       agregaciones de MongoDB para los resultados
└── realtime/        gateway Socket.IO que reparte el estado y los resultados por rol
```

Flujo: cuando el admin cambia el estado o llega un voto, el servicio guarda en MongoDB y emite un evento interno (`@nestjs/event-emitter`). El `LiveGateway` lo escucha, recalcula los resultados (con un debounce de 250 ms para ráfagas de votos) y los envía a las salas que corresponden.

## Estado de la presentación

| Campo                   | Valores                                       | Para qué sirve                          |
| ----------------------- | --------------------------------------------- | --------------------------------------- |
| `audienceView`          | `waiting` · `question` · `results` · `closed` | Lo que ve el celular del participante   |
| `screenView`            | `lobby` · `question` · `results` · `summary`  | Lo que muestra la pantalla proyectada   |
| `currentQuestionId`     | id de pregunta o `null`                       | Pregunta activa                         |
| `acceptingResponses`    | boolean                                       | Abre o cierra la votación               |
| `showResultsToAudience` | boolean                                       | Si la audiencia también recibe gráficos |
| `slideIndex`            | número ≥ 0                                    | Diapositiva de la pantalla proyectada   |
| `showSidePanel`         | boolean                                       | Panel lateral de la diapositiva (lo abre el admin) |

## REST

Las rutas marcadas con 🔒 requieren el header `x-admin-key`.

| Método | Ruta                                       |     | Descripción                                   |
| ------ | ------------------------------------------ | --- | --------------------------------------------- |
| POST   | `/api/surveys`                             | 🔒  | Crear encuesta                                |
| GET    | `/api/surveys` · `/api/surveys/:id`        | 🔒  | Listar / obtener                              |
| PUT    | `/api/surveys/:id`                         | 🔒  | Reemplazar                                    |
| DELETE | `/api/surveys/:id`                         | 🔒  | Eliminar                                      |
| POST   | `/api/presentations`                       | 🔒  | Crear sala `{ title, surveyId }` → genera `code` |
| GET    | `/api/presentations`                       | 🔒  | Listar salas                                  |
| GET    | `/api/presentations/:code`                 |     | Estado + encuesta                             |
| PATCH  | `/api/presentations/:code/state`           | 🔒  | Cambiar estado (parcial)                      |
| POST   | `/api/presentations/:code/next` · `/prev`  | 🔒  | Ir a la pregunta siguiente / anterior y abrirla |
| POST   | `/api/presentations/:code/responses`       |     | Votar `{ participantId, questionId, value }`  |
| GET    | `/api/presentations/:code/results`         |     | Resultados de todas las preguntas             |
| GET    | `/api/presentations/:code/results/:qId`    |     | Resultados de una pregunta                    |

`value` según el tipo de pregunta: `single` → `"opcion"`, `multiple` → `["a","b"]`, `scale` → `4`, `text` → `"texto"`.
`participantId` lo genera el frontend (por ejemplo un UUID guardado en `localStorage`); volver a votar reemplaza el voto anterior.

## WebSocket (`/live`)

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/live', {
  auth: { code: 'ABC123', role: 'audience' }, // 'audience' | 'screen' | 'admin' (+ adminKey)
});
```

Servidor → cliente:

| Evento                  | Quién lo recibe                                      | Payload                    |
| ----------------------- | ---------------------------------------------------- | -------------------------- |
| `presentation:snapshot` | el cliente al conectarse                             | `{ presentation, survey }` |
| `presentation:state`    | todos los de la sala                                 | estado                     |
| `results:update`        | `screen`, `admin` (y `audience` si `showResultsToAudience`) | resultados de la pregunta activa |
| `participants:count`    | `screen`, `admin`                                    | número                     |
| `exception`             | el cliente que causó el error                        | `{ status, message }`      |

Cliente → servidor (responden con ack si salen bien; si fallan, el servidor emite `exception`):

| Evento               | Rol      | Payload                               |
| -------------------- | -------- | ------------------------------------- |
| `audience:answer`    | cualquiera | `{ participantId, questionId, value }` |
| `admin:update-state` | admin    | estado parcial                         |
| `admin:next` / `admin:prev` | admin | —                                   |
