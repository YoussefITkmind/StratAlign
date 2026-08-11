# Performance data

KPI measurement capture, correction, point-in-time resolution and rule-driven
status evaluation. Implements Prompt 2.7 (TSD-02 §4.3, TSD-03 §2/§5).

Everything lives in the PostgreSQL schema `performance`.

## Measurement immutability

Measurements are append-only, and that is a **database** guarantee rather than
an application convention.

The migration `20260811084500_performance_measurement_immutability` creates the
role `spm_app` — the role the application connects as, or is a member of — and
grants it `SELECT, INSERT` on `performance.measurements` and nothing else.
`UPDATE`, `DELETE` and `TRUNCATE` are revoked from that role and from `PUBLIC`.
An update attempt fails with SQLSTATE `42501` no matter which code path issues
it.

The migration/owner role keeps full privileges, so later migrations can still
alter the table. `ALTER DEFAULT PRIVILEGES` gives future tables in each schema
the ordinary read/write baseline; only `measurements` is restricted.

Deployment: give the application a login role that is a member of `spm_app`, or
connect as a role that assumes it. A deployment that connects as the table owner
loses the guarantee — the owner bypasses table privileges by design.

Service-level checks, Zod validation and the tRPC error map remain as defence in
depth. They produce good errors; they are not the enforcement.

## Supersession chain

A correction never rewrites a row. It inserts a new measurement whose
`supersedes_id` points at the row it replaces:

```
M1 value=100 createdAt=T1
M2 value=110 createdAt=T2 supersedes=M1
M3 value=105 createdAt=T3 supersedes=M2
```

`supersedes_id` is `UNIQUE`, so a measurement can be corrected at most once and
a chain can never fork. Corrections are further constrained to the same
KPI version, scope node and period, and a measurement that is already superseded
cannot be superseded again. Both foreign keys use `ON DELETE RESTRICT`; nothing
cascades into a chain, and deletion is prevented by privileges rather than left
to application care.

`MeasurementService.chainFor(id)` walks both directions from any member and
returns the whole chain oldest-first.

## `asOf` semantics

A measurement is *effective* when nothing supersedes it. Point-in-time
resolution applies the same rule with the clock wound back: effective at `asOf`
means it existed by then and nothing that existed by then supersedes it. This is
the audit module's `valid_from`/`valid_to` reasoning expressed over the
supersession chain instead of a separate history table, so no second temporal
framework is introduced.

For the chain above:

| `asOf`             | resolves to |
| ------------------ | ----------- |
| `< T1`             | nothing     |
| `T1 <= asOf < T2`  | M1          |
| `T2 <= asOf < T3`  | M2          |
| `>= T3`            | M3          |

`measurement.list` without `asOf` resolves current values with no temporal
predicate at all, so a row inserted moments ago cannot be filtered out by clock
skew. Independent KPI/scope/period series resolve independently.

## Capture lifecycle

```
DRAFT ──submit──▶ SUBMITTED ──recall──▶ RECALLED ──startSession──▶ DRAFT
```

Rejected transitions:

| From      | To        | Why |
| --------- | --------- | --- |
| DRAFT     | RECALLED  | nothing has been submitted |
| SUBMITTED | SUBMITTED | a submitted period is locked against further edits |
| RECALLED  | SUBMITTED | a recalled session is reopened as a draft first |
| DRAFT/SUBMITTED | new session | one active session per KPI/scope/period |

Submitting appends a measurement: the first value for an empty series, otherwise
a correction superseding the currently effective row. A rejected submission
(feed lock, invalid supersession) leaves the session in `DRAFT` and inserts
nothing.

### Recall cutoff

No workflow or approval module exists in this repository yet, so recall cannot
be gated on an approval decision. The narrowest explicit cutoff is used, with
two independent arms:

1. **`consumedAt`** — set by `CaptureSessionService.markConsumed`, the hook a
   downstream consumer calls when it takes the submission. Once set, recall is
   refused permanently. Phase 3 approval infrastructure should drive this rather
   than introduce a competing concept.
2. **`recallDeadlineAt`** — an optional instant captured when the session
   starts, normally the close of its capture window. Past it, recall is refused.

Neither set means the session stays recallable, which is the correct default
while no downstream consumer exists. Recall is additionally restricted to the
session owner or a `data_steward`.

Recall never rewrites the submitted measurement. It reopens the session so the
next submission appends a correction.

## Feed lock

`source = feed AND locked = true` rejects manual and template correction with
`FEED_MEASUREMENT_LOCKED`; `locked = true` on any other source rejects manual
correction with `MEASUREMENT_LOCKED`. Only a `feed` measurement may supersede a
locked one.

**No feed producer is implemented.** The invariant exists now so that Phase 6
only has to supply the producer.

## Rule Engine integration

Performance implements no threshold or aggregation logic. `RecomputeService`:

1. resolves the KPI's evaluation binding,
2. resolves the currently effective measurement,
3. resolves the **published** rule for the bound rule key via `RulesService`,
4. calls `RulesService.evaluate`, which runs `@spm/rules`,
5. persists the result.

`StatusResult.status` is the band label the engine returned — the engine chooses
it, not this module. `RollupResult.method` is read off the rule document.
`ruleVersionUsed` is a foreign key to the `rules.rule_definitions` row that
produced the result, and that row *is* the immutable rule version, so every
stored result is traceable to exact rule text.

For a KPI with a hierarchy parent, the parent's rollup rule is evaluated over
every active child's currently effective measurement; children with no
measurement are excluded by the engine, not here.

## Events and worker

Consumed:

- `performance.measurement.recorded`
- `schedule.window.closed` — only where the cadence definition's opaque
  `subjectType` is `performance_kpi`, with `subjectId` as the KPI version and
  `payload.scopeNodeId` as the scope. The scheduler stays generic and learns
  nothing about KPIs.

Emitted:

- `performance.status.computed` — every completed evaluation
- `performance.threshold.breached` — **only** on a transition into `off_track`

Breach semantics: `on_track -> off_track` breaches; `off_track -> off_track`
does not; `off_track -> on_track` does not; crossing back into `off_track`
breaches again. A first-ever `off_track` status counts as a crossing.

Recompute is registered as an ordinary `EventSubscriber`, so it rides the
existing outbox relay, dispatch worker, retry backoff and dead-letter handling
rather than introducing a queue.

### Idempotency

`status_results.dedupe_key` and `rollup_results.dedupe_key` are unique and built
from the logical result identity plus the triggering event id. A redelivered
event either finds its result present and returns, or loses the race on the
unique index and treats that as success. Outbox rows use the same key shape, so
no duplicate `status.computed` or `threshold.breached` escapes a retry.

## Evidence reference

`Measurement.evidenceRef` is a nullable, bounded, opaque object-storage
reference. The repository has no object-storage abstraction, so none is invented
here and no upload workflow is implemented — that is Phase 2.8. The column and
its validation exist now so evidence handling has somewhere to land.

## Blockers and assumptions

**The KPI/OKR registry (Prompt 2.4) does not exist in this repository.** There is
no `KpiDefinition`, `KpiVersion`, `ScopeNode`, `Alignment`, KPI hierarchy or
plan/version model anywhere in the schema. Consequences:

- `kpi_version_id`, `scope_node_id`, `parent_kpi_id` and `plan_version_id` are
  unconstrained `TEXT`. They are indexed but carry no foreign key, because there
  is no table to reference. They become foreign keys when 2.4 lands.
- Active-version resolution, KPI→rule binding and hierarchy parentage have no
  source of truth. `performance.kpi_bindings` (`KpiBindingService`) is a
  **temporary bridge** holding exactly those three facts and nothing else — no
  name, owner, unit, definition or version history. It is not a KPI registry and
  must be replaced by, or reduced to an adapter over, the real one.
- `TargetSeries.planVersionId` defaults to `"baseline"`, standing for the
  original plan, because no planning module defines plan-version semantics.

**No approval/workflow infrastructure exists**, hence the explicit recall cutoff
described above rather than an approval gate.

**No object-storage abstraction exists**, hence the opaque `evidenceRef`.

The off-track label is `off_track`, matching the repository's golden threshold
fixtures (`packages/rules/test/fixtures/golden-rules.ts`). It is named in
`performance.events.ts` as the single place breach detection looks for it.
