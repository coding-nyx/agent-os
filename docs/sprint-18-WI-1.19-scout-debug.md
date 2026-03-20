# WI-1.19 — Scout: Debug Overlay Integration

## Type
Module Integration / Debug

## Module
`src/modules/scout/`

## Events to Log

| Event | Category | When |
|-------|----------|------|
| Scout profile loaded | `profile` | Subscription callback |
| Scout profile saved | `profile` | Save call |
| Research session created | `profile` | New session start |
| Document uploaded | `upload` | File upload initiated |
| Document pipeline stage | `upload` | Each pipeline stage |
| Document analysis complete | `upload` | Analysis result received |
| Knowledge node added | `profile` | `addKnowledgeNode` call |
| Deep research initiated | `ai` | Research pipeline start |
| Deep research complete | `ai` | Research pipeline end |
| News briefs generated | `ai` | `generateNewsBriefs` call |
| Digest created | `ai` | Digest generation complete |
| Source added | `profile` | Source CRUD |
| Export triggered | `ai` | Export operation start/complete |

## Depends On
- WI-X.1

## Acceptance Criteria
- [ ] Document upload pipeline visible step-by-step
- [ ] Deep research lifecycle visible
- [ ] Knowledge graph mutations logged
