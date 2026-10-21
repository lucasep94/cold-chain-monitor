# coldchain-telemetry-api

API de telemetría para camiones frigoríficos: ingesta de series temporales, alertas de temperatura y detección de pérdida de señal. Node.js, TypeScript y MongoDB.

<!-- Badges: añadir cuando existan (CI en la fase 6)
![CI](https://github.com/<usuario>/coldchain-telemetry-api/actions/workflows/ci.yml/badge.svg)
-->

> **Estado:** en desarrollo. Las secciones marcadas como "previsto" describen lo que se construirá en cada fase (ver [Roadmap](#roadmap)).
> **Todos los datos son simulados.** El proyecto no usa datos, nombres ni código de ninguna empresa real.

## Qué es

Los camiones que transportan alimentos o medicamentos refrigerados llevan dispositivos que envían cada pocos segundos su ubicación y la temperatura interior. Este proyecto recibe esas lecturas, las almacena, mantiene el estado actual de cada vehículo y genera alertas cuando algo falla.

| Problema                                      | Cómo lo resuelve                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| Muchas lecturas por minuto                    | Colección time-series de MongoDB, con retención configurable                |
| Saber el estado actual sin consultar la serie | `lastReading` desnormalizado en cada vehículo                               |
| Temperatura fuera de rango                    | Motor de alertas con histéresis y una sola alerta abierta por tipo y camión |
| Camión que deja de reportar                   | Job periódico que detecta la pérdida de señal                               |
| Dispositivos que acumulan datos sin cobertura | Ingesta en lotes de hasta 100 lecturas, aceptando lecturas desordenadas     |
| Consultar el histórico de forma útil          | Agregaciones por intervalo (media, mínimo, máximo) y paginación por cursor  |

## Arquitectura

```
Simulador (N camiones) ──HTTP POST /readings──▶ API de ingesta ──▶ MongoDB
                                                    │                 ├─ readings (time-series)
                                                    ▼                 ├─ vehicles (con lastReading)
                                             Motor de alertas ──────▶ ├─ alerts
                                                    ▲                 └─ users
                              Job periódico (pérdida de señal)
                                                    │
                      API de consulta (JWT + roles) ◀── Cliente (fase final)
```

El código sigue una arquitectura por capas: `routes → controllers → services → models`. La lógica de negocio vive solo en los servicios.

## Stack

| Capa               | Tecnología                                                                        |
| ------------------ | --------------------------------------------------------------------------------- |
| Runtime y lenguaje | Node.js 22 LTS, TypeScript (strict)                                               |
| API                | Express 5                                                                         |
| Base de datos      | MongoDB 7 con Mongoose                                                            |
| Validación         | Zod (body, query y variables de entorno)                                          |
| Autenticación      | API key por dispositivo; JWT y refresh token en cookie `httpOnly` para operadores |
| Jobs               | node-cron                                                                         |
| Logging            | pino                                                                              |
| Tests              | Vitest, Supertest                                                                 |
| Documentación      | OpenAPI / Swagger UI                                                              |
| Contenedores y CI  | Docker Compose, GitHub Actions                                                    |

## Decisiones técnicas

| Decisión                                                                            | Motivo                                                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Time-series collection** para `readings`                                          | Está pensada para lecturas periódicas de sensores. Las lecturas se tratan como inmutables   |
| **`lastReading` dentro de `vehicles`**                                              | Evita consultar la serie para mostrar el estado actual                                      |
| **Índice único parcial en `alerts`** (`vehicleId`, `type`, solo con `status: open`) | Garantiza una única alerta abierta por tipo y camión, incluso con peticiones concurrentes   |
| **El `vehicleId` sale de la API key, no del body**                                  | Un dispositivo no puede enviar lecturas en nombre de otro                                   |
| **Solo se guarda el hash de la API key**                                            | La clave en claro se muestra una única vez al crearla o rotarla                             |
| **`lastReading` solo avanza si el timestamp es mayor**                              | Las lecturas pueden llegar desordenadas                                                     |
| **Histéresis configurable**                                                         | Exige N lecturas consecutivas fuera de rango para abrir una alerta y evita falsos positivos |

## API

Base: `/api/v1`. Los errores siguen el formato `{ error: { code, message, details? } }`.

| Método | Ruta                       | Auth        | Descripción                                            | Estado |
| ------ | -------------------------- | ----------- | ------------------------------------------------------ | ------ |
| POST   | `/readings`                | API key     | Ingesta de 1 a 100 lecturas                            | ✅     |
| GET    | `/vehicles`                | JWT         | Lista con estado actual (`?status&plate&page&limit`)   | ✅ \*  |
| POST   | `/vehicles`                | JWT (admin) | Crea un vehículo y devuelve su API key una sola vez    | ✅ \*  |
| GET    | `/vehicles/:id`            | JWT         | Detalle                                                | ✅ \*  |
| PATCH  | `/vehicles/:id`            | JWT (admin) | Edita rango de temperatura, tipo o estado              | ✅ \*  |
| POST   | `/vehicles/:id/rotate-key` | JWT (admin) | Regenera la API key; la anterior deja de funcionar     | ✅ \*  |
| GET    | `/health`                  | —           | Estado del servicio y de la conexión a Mongo           | ✅     |
| POST   | `/auth/login`              | —           | Login de operadores                                    | Fase 5 |
| POST   | `/auth/refresh`            | cookie      | Renueva el access token                                | Fase 5 |
| POST   | `/auth/logout`             | JWT         | Cierra la sesión                                       | Fase 5 |
| GET    | `/vehicles/:id/readings`   | JWT         | Histórico en crudo o agregado (`?from&to&interval=5m`) | Fase 3 |
| GET    | `/alerts`                  | JWT         | Alertas filtrables por estado, tipo y vehículo         | Fase 4 |
| PATCH  | `/alerts/:id/acknowledge`  | JWT         | Reconocer una alerta                                   | Fase 4 |
| GET    | `/docs`                    | —           | Swagger UI                                             | Fase 6 |

\* Hasta la fase 5 las rutas de vehículos no exigen JWT.

### Ingesta

```bash
curl -X POST http://localhost:3000/api/v1/readings \
  -H 'content-type: application/json' -H 'x-api-key: ccm_...' \
  -d '{"timestamp":"2026-10-21T10:00:00Z","temperature":-20.4,"location":{"type":"Point","coordinates":[-3.70,40.41]},"speed":72}'
```

- Acepta una lectura o un array de hasta `MAX_BATCH_SIZE`. Cada lectura se valida por separado: temperatura entre -60 y 60 °C, coordenadas `[lng, lat]` válidas y `timestamp` como mucho 2 min en el futuro y no más antiguo que `READINGS_MAX_AGE_HOURS`.
- **202** `{ accepted, rejected: [{ index, errors }] }` si se guardó al menos una lectura; **400** con el mismo detalle si no se guardó ninguna.
- **401** sin API key o con una desconocida; **403** si el vehículo está `inactive`.

## Puesta en marcha

Requisitos: Node.js ≥ 22.12, pnpm 11 y Docker.

### Todo en Docker

```bash
docker compose up --build   # MongoDB 7 y API en http://localhost:3000
curl http://localhost:3000/api/v1/health
```

La API toma la configuración de `.env.example`; si existe un `.env` local, sus valores tienen prioridad.

### API en local con recarga en caliente

```bash
cp .env.example .env
docker compose up -d mongo
pnpm install
pnpm dev
```

| Comando                        | Qué hace                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `pnpm dev`                     | API en modo watch (`tsx`) leyendo `.env`                                        |
| `pnpm test`                    | Tests con MongoDB 7 en memoria (la primera vez descarga el binario de `mongod`) |
| `pnpm lint` / `pnpm typecheck` | ESLint con reglas type-checked y `tsc --noEmit`                                 |
| `pnpm build`                   | Compila la API y el simulador                                                   |
| `pnpm format`                  | Prettier                                                                        |
| `pnpm --filter api seed`       | Crea la flota de demo y escribe sus API keys en `simulator/keys.json`           |

### Demo con el simulador

```bash
docker compose up -d --build              # MongoDB y API
pnpm install
pnpm --filter api seed                    # 5 camiones ficticios + simulator/keys.json
docker compose --profile demo up simulator
```

O, sin Docker para el simulador:

```bash
pnpm --filter simulator start --trucks 3 --interval 2
```

El seed borra y vuelve a crear los vehículos de demo con claves nuevas, así que hay que reiniciar el simulador después de ejecutarlo.

### Simulador

Cada camión recorre ida y vuelta una ruta predefinida (Madrid-Valencia, Zaragoza-Barcelona o Sevilla-Málaga) con velocidad variable, y su temperatura oscila con ruido gaussiano alrededor del centro de su rango. Usa la API key de su vehículo, igual que un dispositivo real.

| Opción            | Por defecto                                 |
| ----------------- | ------------------------------------------- |
| `--trucks <n>`    | Todas las claves de `keys.json`             |
| `--interval <s>`  | `5`                                         |
| `--api-url <url>` | `$API_URL` o `http://localhost:3000/api/v1` |
| `--keys <path>`   | `./keys.json`                               |

Escenarios de fallo (fase 4):

| Escenario         | Efecto                                                             |
| ----------------- | ------------------------------------------------------------------ |
| `cooling-failure` | La temperatura sube gradualmente hasta superar el máximo permitido |
| `door-open`       | Pico breve de temperatura que vuelve a la normalidad               |
| `signal-blackout` | El camión deja de enviar durante unos minutos                      |
| `sensor-glitch`   | Lecturas absurdas puntuales para probar la validación              |

## Configuración

Las variables se validan con Zod al arrancar ([`api/src/config/env.ts`](api/src/config/env.ts)). Si falta alguna o tiene un formato inválido, el proceso termina con código 1 y lista cada problema:

```
Invalid environment configuration:
  - MONGODB_URI: is required
  - JWT_ACCESS_SECRET: is required
```

Los valores de [`.env.example`](.env.example) son solo para desarrollo.

| Variable                                   | Descripción                                            | Por defecto                           |
| ------------------------------------------ | ------------------------------------------------------ | ------------------------------------- |
| `PORT`                                     | Puerto de la API                                       | `3000`                                |
| `LOG_LEVEL`                                | Nivel de log de pino                                   | `info`                                |
| `MONGODB_URI`                              | Conexión a MongoDB                                     | `mongodb://localhost:27017/coldchain` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secretos de los tokens                                 | —                                     |
| `CORS_ORIGINS`                             | Orígenes permitidos                                    | —                                     |
| `READINGS_RETENTION_DAYS`                  | Retención de lecturas (TTL de la time-series)          | `30`                                  |
| `READINGS_MAX_AGE_HOURS`                   | Antigüedad máxima aceptada para una lectura            | `24`                                  |
| `SIGNAL_TIMEOUT_MINUTES`                   | Minutos sin lecturas para marcar pérdida de señal      | `5`                                   |
| `ALERT_CONSECUTIVE_READINGS`               | Lecturas consecutivas fuera de rango para abrir alerta | `2`                                   |
| `MAX_BATCH_SIZE`                           | Máximo de lecturas por petición                        | `100`                                 |

## Estructura del repositorio

```
coldchain-telemetry-api/
├─ api/            # API Express (config, modules, jobs, middlewares)
├─ simulator/      # Simulador de flota
├─ web/            # Cliente Next.js (fase 7)
├─ docs/           # Especificación del proyecto
├─ docker-compose.yml
└─ .env.example
```

## Tests

Vitest + Supertest contra un MongoDB 7 en memoria (`mongodb-memory-server`), sin dependencias externas.

Cubierto ahora:

- Variables de entorno, middleware de errores y `validate` (campos desconocidos, inyección NoSQL), `/health` con Mongo conectado y caído.
- Vehículos: creación, matrícula duplicada (409), filtros, paginación, `minTemp < maxTemp` sobre los valores guardados, rotación de la API key (la anterior devuelve 401).
- Ingesta: API key ausente, desconocida o de un vehículo inactivo; lote parcialmente inválido y totalmente inválido; límites del lote; lecturas desordenadas y 20 peticiones en paralelo sin que `lastReading` retroceda; colección time-series con su TTL.
- Simulador: interpolación de rutas, ruido gaussiano y movimiento del camión.

Previsto: motor de alertas, permisos por rol y concurrencia de alertas.

```bash
pnpm test
```

## Roadmap

- [x] **Fase 1.** Base del proyecto: TypeScript, Express, Docker Compose, `/health`
- [x] **Fase 2.** Vehículos e ingesta: modelos, `POST /readings`, simulador básico
- [ ] **Fase 3.** Histórico: consulta en crudo y agregada
- [ ] **Fase 4.** Alertas: motor, job de pérdida de señal y escenarios del simulador
- [ ] **Fase 5.** Autenticación y roles
- [ ] **Fase 6.** Tests, Swagger, CI y despliegue
- [ ] **Fase 7.** Front mínimo en Next.js
- [ ] **Extras.** Mapa en vivo, geocercas, MQTT y notificaciones por email

## Documentación

La especificación completa (modelo de datos, lógica de negocio, API y convenciones) está en [`docs/spec.md`](docs/spec.md).

## Licencia

MIT. Consulta el archivo [`LICENSE`](LICENSE).
