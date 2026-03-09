# Documents — Document Intelligence

> **ID**: `documents` | **Theme**: Slate | **Core**: No | **Soul Priority**: — | **Security**: locked

## Purpose
Document intelligence module — handles PDF/image upload, OCR, text extraction, and AI-powered document analysis. A support module used by other modules rather than a standalone user-facing agent.

## Cross-Module Links
- Used by Ledger for financial document processing (receipts, invoices, bank statements)
- Used by Scout for research paper analysis
- Used by Titan for lab result parsing

## Data Shape
Ingested documents with extracted text, metadata, and AI-generated analysis summaries. Supports PDF, images, and structured document formats.

## Implementation Notes
- Peripheral module — no agent personality, no onboarding, no NSV interaction
- No soul impact; purely a service layer for other modules
