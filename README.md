# coldchain-telemetry-api

API de telemetría para camiones frigoríficos: ingesta de series temporales, alertas de temperatura y detección de pérdida de señal. Node.js, TypeScript y MongoDB.

<!-- Badges: añadir cuando existan (CI en la fase 6)
![CI](https://github.com/<usuario>/coldchain-telemetry-api/actions/workflows/ci.yml/badge.svg)
-->

> **Estado:** en desarrollo. Las secciones marcadas como "previsto" describen lo que se construirá en cada fase (ver [Roadmap](#roadmap)).
> **Todos los datos son simulados.** El proyecto no usa datos, nombres ni código de ninguna empresa real.

## Qué es

Los camiones que transportan alimentos o medicamentos refrigerados llevan dispositivos que envían cada pocos segundos su ubicación y la temperatura interior. Este proyecto recibe esas lecturas, las almacena, mantiene el estado actual de cada vehículo y genera alertas cuando algo falla.

| Problema | Cómo lo resuelve |
|---|---|
| Muchas lecturas por minuto | Colección time-series de MongoDB, con retención configurable |
| Saber el estado actual sin consultar la serie | `lastReading` desnormalizado en cada vehículo |
| Temperatura fuera de rango | Motor de alertas con histéresis y una sola alerta abierta por tipo y camión |
| Camión que deja de reportar | Job periódico que detecta la pérdida de señal |
| Dispositivos que acumulan datos sin cobertura | Ingesta en lotes de hasta 100 lecturas, aceptando lecturas desordenadas |
| Consultar el histórico de forma útil | Agregaciones por intervalo (media, mínimo, máximo) y paginación por cursor |

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

| Capa | Tecnología |
|---|---|
| Runtime y lenguaje | Node.js 22 LTS, TypeScript (strict) |
| API | Express 5 |
| Base de datos | MongoDB 7 con Mongoose |
| Validación | Zod (body, query y variables de entorno) |
| Autenticación | API key por dispositivo; JWT y refresh token en cookie `httpOnly` para operadores |
| Jobs | node-cron |
| Logging | pino |
| Tests | Vitest, Supertest |
| Documentación | OpenAPI / Swagger UI |
| Contenedores y CI | Docker Compose, GitHub Actions |

## Decisiones técnicas

| Decisión | Motivo |
|---|---|
| **Time-series collection** para `readings` | Está pensada para lecturas periódicas de sensores. Las lecturas se tratan como inmutables |
| **`lastReading` dentro de `vehicles`** | Evita consultar la serie para mostrar el estado actual |
| **Índice único parcial en `alerts`** (`vehicleId`, `type`, solo con `status: open`) | Garantiza una única alerta abierta por tipo y camión, incluso con peticiones concurrentes |
| **El `vehicleId` sale de la API key, no del body** | Un dispositivo no puede enviar lecturas en nombre de otro |
| **Solo se guarda el hash de la API key** | La clave en claro se muestra una única vez al crearla o rotarla |
| **`lastReading` solo avanza si el timestamp es mayor** | Las lecturas pueden llegar desordenadas |
| **Histéresis configurable** | Exige N lecturas consecutivas fuera de rango para abrir una alerta y evita falsos positivos |

## API (prevista)

Base: `/api/v1`. Los errores siguen el formato `{ error: { code, message, details? } }`.

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/readings` | API key | Ingesta de 1 a 100 lecturas |
| POST | `/auth/login` | — | Login de operadores |
| POST | `/auth/refresh` | cookie | Renueva el access token |
| POST | `/auth/logout` | JWT | Cierra la sesión |
| GET | `/vehicles` | JWT | Lista con estado actual |
| POST | `/vehicles` | JWT (admin) | Crea un vehículo y devuelve su API key |
| GET | `/vehicles/:id/readings` | JWT | Histórico en crudo o agregado (`?from&to&interval=5m`) |
| GET | `/alerts` | JWT | Alertas filtrables por estado, tipo y vehículo |
| PATCH | `/alerts/:id/acknowledge` | JWT | Reconocer una alerta |
| GET | `/health` | — | Estado del servicio y de la conexión a Mongo |
| GET | `/docs` | — | Swagger UI |

## Puesta en marcha (previsto)

Requisitos: Node.js 22, pnpm y Docker.

```bash
git clone https://github.com/<usuario>/coldchain-telemetry-api.git
cd coldchain-telemetry-api
cp .env.example .env
pnpm install
docker compose up -d        # MongoDB y API
pnpm --filter api seed      # vehículos de demo y usuarios admin y operator
```

Los nombres exactos de los scripts se confirmarán al cerrar la fase 2.

### Simulador

El simulador emula una flota de camiones que recorren rutas predefinidas y envían lecturas a la API.

```bash
pnpm --filter simulator start --trucks 5 --interval 5 --scenario cooling-failure:truck-2
```

| Escenario | Efecto |
|---|---|
| `cooling-failure` | La temperatura sube gradualmente hasta superar el máximo permitido |
| `door-open` | Pico breve de temperatura que vuelve a la normalidad |
| `signal-blackout` | El camión deja de enviar durante unos minutos |
| `sensor-glitch` | Lecturas absurdas puntuales para probar la validación |

## Configuración

Las variables se validan con Zod al arrancar. Si falta alguna, el proceso falla con un mensaje claro.

| Variable | Descripción | Por defecto |
|---|---|---|
| `PORT` | Puerto de la API | `3000` |
| `MONGODB_URI` | Conexión a MongoDB | `mongodb://localhost:27017/coldchain` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secretos de los tokens | — |
| `CORS_ORIGINS` | Orígenes permitidos | — |
| `READINGS_RETENTION_DAYS` | Retención de lecturas | `30` |
| `SIGNAL_TIMEOUT_MINUTES` | Minutos sin lecturas para marcar pérdida de señal | `5` |
| `ALERT_CONSECUTIVE_READINGS` | Lecturas consecutivas fuera de rango para abrir alerta | `2` |
| `MAX_BATCH_SIZE` | Máximo de lecturas por petición | `100` |

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

Previsto: Vitest y Supertest sobre el motor de alertas, la ingesta (incluidos lotes parciales y lecturas desordenadas), los permisos por rol y la concurrencia de alertas.

```bash
pnpm test
```

## Roadmap

- [ ] **Fase 1.** Base del proyecto: TypeScript, Express, Docker Compose, `/health`
- [ ] **Fase 2.** Vehículos e ingesta: modelos, `POST /readings`, simulador básico
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
