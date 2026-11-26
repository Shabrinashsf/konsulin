# API endpoints not used by the web app

The web app calls every API route except the one below. Checked by matching every `@Get/@Post/@Patch/@Delete` in the
controllers against every `api.get/list/listAll/post/patch/del/download` call in `apps/web/src`. The consultation
actions `propose`, `reschedule`, `reject`, `cancel` and `complete` go through a dynamic path
(`/consultations/${id}/${kind}` in `src/routes/consultation-detail.tsx`), so they count as used.

| Endpoint      | Location in `apps/api`                       | Why the UI does not need it                                                     |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /health` | `src/health/health.controller.ts` (`check`)  | Operational check (server time in UTC and WIB) for monitoring and deployment.  |

When an endpoint is added to a controller, either call it from the web app or add it here with the reason.
