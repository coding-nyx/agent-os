# Onboarding Mode Migration (Sprint 5)

Date: March 10, 2026

This document defines onboarding-mode ownership for routed modules and the migration target for fast-track validation behavior.

## Mode Contract

- `required`: module blocks workspace until onboarding completes.
- `optional`: module workspace is available immediately; onboarding is non-blocking.
- `hybrid`: required baseline onboarding first, followed by optional secondary onboarding phases.

## Routed Module Mapping

- `orchestrator` -> `required`
- `agnes` -> `required`
- `titan` -> `hybrid`
- `ledger` -> `required`
- `atlas` -> `optional`
- `scout` -> `optional`
- `forge` -> `optional`

## Fast-Track Validation Policy

- Fast-track completion is allowed only when both checks pass:
  - schema guard (required fields present)
  - LLM validator confidence >= module threshold in `MODULE_MANIFEST[moduleId].onboarding.fastTrack.confidenceThreshold`
- On any failure (`missing fields`, `validator unavailable`, `below confidence threshold`), the flow deterministically falls back to guided onboarding.

## Current Fast-Track-Enabled Modules

- `agnes`
- `titan`
- `ledger`
- `atlas`

`scout`, `forge`, and `orchestrator` fast-track are disabled by policy.
