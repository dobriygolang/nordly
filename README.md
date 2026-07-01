# project-nordly

Monorepo of **independent microservices**. Each service is self-contained — open its folder and read local `AGENTS.md`.

## Services


| Service  | Path                                     | Prod               |
| -------- | ---------------------------------------- | ------------------ |
| identity | [services/identity/](services/identity/) | yes                |
| billing  | [services/billing/](services/billing/)   | yes                |
| sandbox  | [services/sandbox/](services/sandbox/)   | yes                |
| rooms    | [services/rooms/](services/rooms/)       | yes                |
| tracker  | [services/tracker/](services/tracker/)   | yes                |
| notes    | [services/notes/](services/notes/)       | yes                |
| focus    | [services/focus/](services/focus/)       | yes                |
| ai       | [services/ai/](services/ai/)             | CI only (post-MVP) |
| template | [services/template/](services/template/) | skeleton only      |


Ports and DB names: [AGENTS.md](AGENTS.md#port-allocation-defaults).

## Docs


| Doc                                                              | For                                 |
| ---------------------------------------------------------------- | ----------------------------------- |
| [AGENTS.md](AGENTS.md)                                           | Monorepo index, service template    |
| [docs/onboarding/](docs/onboarding/)                             | Architecture diagrams + service map |
| [deploy/PRODUCTION_CHECKLIST.md](deploy/PRODUCTION_CHECKLIST.md) | First prod deploy                   |
| [deploy/RUNBOOK.md](deploy/RUNBOOK.md)                           | Ops, incidents, LLM tuning          |




## Local dev

```bash
cd services/identity && make start   # JWT keys + Postgres + Redis
cd apps/web && npm install && npm run dev   # :5173, proxies /v1
```



## Production

Canonical site: **[https://trynordly.app](https://trynordly.app)** — API `api.trynordly.app`; legacy `druz9.*` redirects to trynordly.app.

```bash
cd deploy && cp .env.example .env && make keys && make up
```

Root `go.work` is optional. Services build with `GOWORK=off`.

