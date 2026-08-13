# Phase 1 roadmap

1. Platform foundation — local infrastructure, CI, identity, tenancy, audit primitives.
2. CRM slice — customers, contacts, properties, tags, search, activity timeline.
3. Workforce slice — technicians, skills, availability, service areas.
4. Operations slice — jobs, appointments, statuses, assignment, dispatch board.
5. Dashboard slice — operational metrics, workload, revenue-ready event model.
6. Production hardening — rate limits, RLS defense in depth, observability, backups, deployment manifests.

Each slice should ship the smallest safe product increment. Backend-first slices are acceptable when they reduce production risk, preserve Netlify credits, or create the workflow foundation for a later UI pass. User-facing milestones should still include responsive UI states before they are treated as demo-ready.
