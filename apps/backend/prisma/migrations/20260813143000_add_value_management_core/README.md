# Phase 5.1 value schema migration

This migration introduces the `value` PostgreSQL schema for configurable benefit categories, benefits, immutable baselines, value-state history, check-ins, gate reviews, and future feed bindings. The SQL migration is intentionally kept separate from the long-lived XState lifecycle implementation so database invariants can be verified independently with Testcontainers.
