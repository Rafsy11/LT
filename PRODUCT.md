# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

- **NOC Engineers & Supervisors (Web):** Monitor real-time optical telemetry (OLT, FDT, ODP), manage network outages, approve AI action drafts, enforce technician access/sessions.
- **Dispatchers & Helpdesk (Web):** Create and triage work orders, assign field tickets, track SLA deadlines.
- **Field Technicians / Teknisi Lapangan (Mobile):** Validate ODP pole locations, perform optical power measurements (OPM) under direct sunlight, submit work evidence with geofence and mock-GPS verification, store reports in offline queues when cell coverage drops.
- **Security & Compliance Auditors (Web):** Audit RBAC permission matrices, inspect immutable event logs, verify zero information leakage.

## Product Purpose

An on-premise FTTH ISP Operations, Master Data, Optical Telemetry, and Work Order Execution suite engineered for Indonesian fiber topology. It pairs high-density NOC telemetry with a glare-resistant, offline-capable mobile workflow for field technicians.

## Positioning

Deterministic, zero-data-leakage operational software. Unlike generic cloud ticketing tools or flashy AI dashboards, this system provides:
1. Strict cybersecurity pre-hardening (zero raw database/ORM leaks).
2. Millisecond-exact critical button locking to prevent double-execution.
3. Strict client-side and server-side RBAC permission gating.
4. Glare-resistant high-contrast outdoor UX for harsh tropical sunlight near utility poles.

## Operating Context

- **NOC Control Room (Web):** Continuous operation, multi-screen environment, keyboard navigation, dense data grids with tabular figures, instant role-switching for verification.
- **Field Physical Environment (Mobile):** Direct tropical sunlight (high glare), high ambient heat near ODP utility poles, intermittent 4G/LTE connectivity requiring local SQLite/IndexedDB offline queueing, single-handed glove-friendly touch targets (min 48px).

## Capabilities and Constraints

- **Anti-Information Leakage:** Strict UI sanitization. Never leak `error.stack`, table names, or raw Prisma/PostgreSQL errors. UI errors are mapped exclusively through `@repo/shared` error codes into clear Indonesian feedback.
- **1ms Debounce & State Locking:** Immediate `disabled={isSubmitting}` and ref-level debounce lock at millisecond zero on critical triggers (*Submit Laporan ODP* on mobile, *[Setujui & Eksekusi]* on Web AI draft cards).
- **RBAC Permission Matrix:** Client-side conditional rendering with `<PermissionGate />` matching backend permission enforcement. Sensitive controls (Force Logout, Role Editor, Create Ticket) are hidden or cleanly disabled with lock badges when unpermitted.
- **High-Contrast Outdoor UX:** WCAG AAA outdoor color tokens (`#056434` emerald for Normal -15 to -24 dBm, `#92400e` amber for Warning -25 to -27 dBm, `#991b1b` crimson for Critical > -27 dBm / Los), yellow high-visibility GPS mock alerts, and dedicated offline queue badges.
- **Monorepo Architecture:** Next.js 15 App Router web application (`apps/web`), React Native headless/mobile hook screens (`apps/mobile`), shared schemas and security constants (`packages/shared`), and Prisma ORM client (`packages/database`).

## Brand Commitments

- **Tone & Identity:** Serious, utilitarian, mission-critical infrastructure tool.
- **Typography:** Inter / system sans-serif for UI, JetBrains Mono / tabular figures for optical dBm measurements and telemetry data.
- **Anti-Slop Craft:** No generic blue-purple gradients, no floating soft shadows, no decorative card grids without purpose, no em-dashes in UI copy, no placeholder claims. Surfaces separated by clean tone steps rather than harsh borders or fluffy drops.

## Evidence on Hand

- Complete PRD and System Design Specification in `PRODUCT REQUIREMENTS DOCUMENT (PRD) & SYSTEM DESIGN SPECIFICATION.md`.
- Shared constants, error codes, and permission matrix in `packages/shared/src/constants/index.ts`.
- Prisma database schema in `packages/database/prisma/schema.prisma`.
- Working Next.js web application running on local port 3000 with Turbopack.

## Product Principles

1. **Substance Over Decoration:** Every visual element and metric serves network reliability, technician safety, or data integrity.
2. **Fail Safe & Leak Nothing:** System errors are normalized into user-actionable instructions without exposing server internals or database topology.
3. **Field-First Usability:** If an interface cannot be operated under 12:00 PM sunlight on a dusty road in 5 seconds, it is defective.
4. **Instant State Certainty:** Every critical mutation locks immediately to prevent race conditions and provides unambiguous visual confirmation.

## Accessibility & Inclusion

- Compliance with WCAG 2.1 AA indoors and WCAG AAA (7:1+ contrast) for outdoor optical indicators.
- Keyboard accessible navigation across all web dashboard tables, modals, and drawers (`Tab`, `Enter`, `Escape`).
- Minimum touch target of 48x48px on mobile field interfaces.
