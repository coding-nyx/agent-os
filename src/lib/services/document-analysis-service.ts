// --- Document Analysis Service (Shared, Module-Agnostic) ---
//
// Parses health documents (PDF, CSV, image, plain text) and drives a
// structured-extraction LLM pass.  This service has ZERO imports from
// src/modules/ and carries no module-specific logic.  It is safe to
// reuse from Soma, Ledger, Scout, or any future module.
//
// Design decisions:
//   • PDF text extraction via pdfjs-dist (already bundled in the project).
//   • CSV tabularisation via PapaParse (already bundled).
//   • Images are returned as a data URL — multimodal LLM handling is the
//     caller's responsibility; this service signals it with type='image'.
//   • buildAnalysisPrompt truncates input to ~8 k tokens (32 000 chars) so
//     the caller never has to worry about context-window overflow.
//   • parseAnalysisResponse never throws — it returns an empty result on
//     malformed LLM output so the caller can degrade gracefully.

import Papa from 'papaparse';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker?url';

GlobalWorkerOptions.workerSrc = workerSrc;

// ── Constants ─────────────────────────────────────────────────────────────────

/** ~8 000 LLM tokens at 4 chars/token average. */
const MAX_PROMPT_CHARS = 32_000;

/** Maximum PDF pages to extract (mirrors lab-import-service.ts). */
const MAX_PDF_PAGES = 12;

/** Maximum number of extracted fields returned by the LLM that we trust. */
const MAX_EXTRACTED_FIELDS = 200;

/** Maximum number of detected panel names returned by the LLM. */
const MAX_DETECTED_PANELS = 20;

/** Maximum chars we store verbatim from the sourceText excerpt. */
const MAX_SOURCE_TEXT_CHARS = 100;

// ── Exported Types ────────────────────────────────────────────────────────────

export type DocumentType = 'pdf' | 'csv' | 'text' | 'image';

/**
 * A single structured value extracted from a health document by the LLM.
 * Confidence of 0 signals the LLM was unsure — callers should surface these
 * to the user for manual review rather than silently discarding them.
 */
export interface ExtractedField {
  /** camelCase identifier, e.g. "totalCholesterol", "hemoglobin". */
  fieldName: string;
  /** Exact value as it appears in the document (no unit conversion). */
  value: string | number;
  /** Unit of measure, e.g. "mmol/L", "g/dL", "bpm". */
  unit?: string;
  /** Reference range string as printed in the document, e.g. "3.5-5.0 mmol/L". */
  referenceRange?: string;
  /**
   * LLM-reported confidence in the extraction, 0.0–1.0.
   * 0 means the LLM was explicitly told not to guess — treat as "unverified".
   */
  confidence: number;
  /** Verbatim excerpt (≤100 chars) from the source document. */
  sourceText?: string;
  /**
   * Semantic category, e.g. "lipid_panel", "cbc", "metabolic".
   * Matches one of the categories listed in buildAnalysisPrompt.
   */
  category?: string;
}

/**
 * The complete result of a single document analysis pass.
 * rawText is held ONLY in-memory and MUST NOT be persisted to any store
 * (use the SHA-256 hash for deduplication instead).
 */
export interface DocumentAnalysisResult {
  documentType: DocumentType;
  /** Top-level panel/section names detected by the LLM. */
  detectedPanels: string[];
  extractedFields: ExtractedField[];
  /**
   * Full extracted text — IN MEMORY ONLY.
   * Never write this to Firestore, Firebase Storage, or any log sink.
   */
  rawText: string;
  /** Approximate LLM prompt token usage (optional; used for quota tracking). */
  analysisPromptTokens?: number;
  /** Anything the LLM could not categorise, or a description of the problem. */
  unrecognisedContent?: string;
  /** ISO-8601 timestamp of when analysis completed. */
  analysedAt: string;
}

// ── DocumentAnalysisService ───────────────────────────────────────────────────

export class DocumentAnalysisService {
  /**
   * Extracts readable text from a File.
   *
   * Supported types:
   *  - **PDF**   → up to 12 pages of text via pdfjs-dist
   *  - **CSV**   → tabularised with PapaParse (cells joined by " | ")
   *  - **Image** → returned as a data URL; caller must use a multimodal LLM
   *  - **Other** → UTF-8 decoded plain text
   *
   * Complexity: O(n) in document size / page count.
   *
   * @param file - The File object to parse (from `<input type="file">` or drag-drop).
   * @returns `{ text, type }` where `type` reflects the detected document format.
   */
  static async extractText(file: File): Promise<{ text: string; type: DocumentType }> {
    const filename = file.name.toLowerCase();

    // ── PDF ──────────────────────────────────────────────────────────────────
    if (file.type === 'application/pdf' || filename.endsWith('.pdf')) {
      const buffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: buffer }).promise;
      const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
      const chunks: string[] = [];

      for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const lines = content.items
          .map((item: unknown) => {
            const entry = item as Record<string, unknown>;
            return typeof entry?.str === 'string' ? entry.str : '';
          })
          .filter((line: string) => line.trim().length > 0);
        chunks.push(lines.join(' '));
      }

      return { text: chunks.join('\n'), type: 'pdf' };
    }

    // ── Image — return as data URL for multimodal LLM handling ───────────────
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
    if (
      file.type.startsWith('image/') ||
      imageExtensions.some((ext) => filename.endsWith(ext))
    ) {
      const buffer = await file.arrayBuffer();
      const blob = new Blob([buffer], { type: file.type });
      const dataUrl = await DocumentAnalysisService._blobToDataUrl(blob);
      // The "text" here is actually a data URL — callers must check type === 'image'
      // before sending to a text-only LLM endpoint.
      return { text: dataUrl, type: 'image' };
    }

    // ── Text / CSV ────────────────────────────────────────────────────────────
    const buffer = await file.arrayBuffer();
    const rawText = new TextDecoder('utf-8').decode(buffer);

    if (file.type === 'text/csv' || filename.endsWith('.csv')) {
      const parsed = Papa.parse<string[]>(rawText, { skipEmptyLines: true });
      const rows = Array.isArray(parsed.data) ? (parsed.data as string[][]) : [];
      const tabular = rows
        .map((row: string[]) =>
          row.map((cell: string) => String(cell ?? '').trim()).filter(Boolean).join(' | ')
        )
        .filter(Boolean)
        .join('\n');
      return { text: tabular, type: 'csv' };
    }

    return { text: rawText, type: 'text' };
  }

  /**
   * Builds a production-quality structured-extraction prompt.
   *
   * The prompt instructs the LLM to:
   *  - Output ONLY a valid JSON object (no prose, no markdown fences)
   *  - Strip all PII (name, DOB, address, NHS/insurance numbers)
   *  - Set confidence=0 for uncertain values instead of guessing
   *  - Handle unrecognised document types with an empty extractedFields array
   *  - Truncate input to ≤8 000 tokens (32 000 chars) automatically
   *
   * Complexity: O(n) in rawText length.
   *
   * @param rawText    - Extracted document text from extractText().
   * @param contextHint - Optional hint to help the LLM (e.g. "blood test panel").
   * @returns A complete system+user prompt string ready for an LLM call.
   */
  static buildAnalysisPrompt(rawText: string, contextHint?: string): string {
    const truncated =
      rawText.length > MAX_PROMPT_CHARS
        ? rawText.slice(0, MAX_PROMPT_CHARS) + '\n\n[...DOCUMENT TRUNCATED FOR LENGTH...]'
        : rawText;

    const contextLine =
      contextHint != null && contextHint.trim().length > 0
        ? `\nContext hint: ${contextHint.trim()}`
        : '';

    return `You are a medical document parser specialising in structured health-data extraction. \
Your task is to read the document below and return ONLY a valid JSON object matching the schema described. \
Do NOT include any prose, explanation, markdown, or text outside the JSON object.

PRIVACY RULE — MANDATORY:
You MUST omit all personally identifiable information (PII). \
This includes: patient name, date of birth, exact age, home or work address, NHS number, \
national insurance number, insurance policy number, phone number, email address, \
account numbers, and any other unique personal identifier. \
If you encounter these fields in the document, skip them entirely — do not include them in any output field.

CONFIDENCE RULE — MANDATORY:
Set "confidence" to 0.0 for any value that is unclear, illegible, abbreviated beyond certainty, \
or that you are not confident about. Do NOT guess, infer, or interpolate values. \
A confidence of 0 tells the user the value needs manual verification.

UNRECOGNISED DOCUMENTS:
If the document does not contain recognisable medical data (e.g. it is an invoice, recipe, \
legal letter, or unrelated text), return the JSON with an empty extractedFields array \
and describe the document type in the "unrecognisedContent" field.${contextLine}

OUTPUT FORMAT — respond with ONLY this JSON object, no other text:
{
  "detectedPanels": ["Human-readable panel/section name", ...],
  "extractedFields": [
    {
      "fieldName": "camelCase field identifier (e.g. totalCholesterol, hemoglobin, systolicBP)",
      "value": "exact numeric or string value as printed in the document — do not convert units",
      "unit": "unit of measure if present (e.g. mmol/L, g/dL, bpm, mg/dL) — omit if absent",
      "referenceRange": "reference range as printed (e.g. 3.5-5.0 mmol/L) — omit if absent",
      "confidence": 0.0,
      "sourceText": "verbatim excerpt from the document (max 100 chars)",
      "category": "one of: lipid_panel | cbc | metabolic | thyroid | hormone | renal | liver | cardiac | imaging | vitals | medication | allergy | condition | clearance | other"
    }
  ],
  "unrecognisedContent": "optional — describe content that could not be categorised, or omit field entirely"
}

DOCUMENT TYPES TO HANDLE:
- Blood panels: CBC (haemoglobin, WBC, neutrophils, platelets, haematocrit)
- Lipid panel: total cholesterol, LDL, HDL, VLDL, triglycerides
- Metabolic / renal: sodium, potassium, chloride, bicarbonate, BUN, creatinine, eGFR, glucose
- Liver function: ALT, AST, ALP, GGT, bilirubin (total and direct), albumin
- Thyroid: TSH, free T3, free T4, T3 uptake, anti-TPO antibodies
- Hormones: testosterone (total/free), oestradiol, FSH, LH, DHEA-S, prolactin, cortisol
- Cardiovascular: ECG findings, blood pressure (systolic/diastolic), resting heart rate, troponin, BNP
- Imaging reports: X-ray, MRI, CT, ultrasound — extract key findings as string values with confidence ≤0.7
- GP / clinical notes: diagnoses (type="condition"), medications (type="medication"), allergies (type="allergy"), clearances
- Fitness / wellness: BMI, body fat %, VO2max, resting HR, SpO2, spirometry values

FIELD NAMING RULES:
- fieldName MUST be camelCase, no spaces, no special characters
- If the same field appears multiple times (e.g. BP on different dates), suffix with date or index: "systolicBP_2024-01", "systolicBP_2024-03"
- Do NOT add computed, derived, or inferred values — only values explicitly present in the document
- detectedPanels should list the top-level section or panel headers found in the document

---BEGIN DOCUMENT---
${truncated}
---END DOCUMENT---`;
  }

  /**
   * Safely parses the LLM's JSON response into a DocumentAnalysisResult.
   *
   * This method:
   *  - Strips optional markdown code fences
   *  - Validates the top-level shape of the parsed object
   *  - Type-guards every ExtractedField (rejects nulls and malformed entries)
   *  - Clamps confidence values to [0, 1]
   *  - Returns an empty result (no fields, no panels) on any parse/validation failure
   *  - Never throws
   *
   * Complexity: O(f) in the number of extracted fields.
   *
   * @param llmResponse - Raw string response from the LLM.
   * @param rawText     - The original document text (attached for in-memory use).
   * @returns A fully validated DocumentAnalysisResult.
   */
  static parseAnalysisResponse(llmResponse: string, rawText: string): DocumentAnalysisResult {
    const now = new Date().toISOString();

    const emptyResult: DocumentAnalysisResult = {
      documentType: 'text',
      detectedPanels: [],
      extractedFields: [],
      rawText,
      analysedAt: now,
      unrecognisedContent: 'LLM response could not be parsed.',
    };

    if (!llmResponse || typeof llmResponse !== 'string') {
      return emptyResult;
    }

    try {
      // Strip optional markdown code fences the LLM sometimes adds.
      const cleaned = llmResponse
        .replace(/^```json\s*/im, '')
        .replace(/^```\s*/im, '')
        .replace(/\s*```\s*$/m, '')
        .trim();

      if (!cleaned) {
        return { ...emptyResult, unrecognisedContent: 'LLM returned an empty response.' };
      }

      const parsed: unknown = JSON.parse(cleaned);

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ...emptyResult, unrecognisedContent: 'LLM response was not a JSON object.' };
      }

      const obj = parsed as Record<string, unknown>;

      // ── detectedPanels ────────────────────────────────────────────────────
      const detectedPanels: string[] = Array.isArray(obj.detectedPanels)
        ? (obj.detectedPanels as unknown[])
            .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
            .slice(0, MAX_DETECTED_PANELS)
        : [];

      // ── extractedFields ───────────────────────────────────────────────────
      const rawFields = Array.isArray(obj.extractedFields) ? (obj.extractedFields as unknown[]) : [];

      const extractedFields: ExtractedField[] = rawFields
        .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
        .reduce<ExtractedField[]>((acc, f) => {
          const fieldName =
            typeof f.fieldName === 'string' && f.fieldName.trim().length > 0
              ? f.fieldName.trim()
              : null;

          if (!fieldName) return acc; // skip entries without a name

          const rawValue = f.value;
          const value: string | number =
            typeof rawValue === 'number'
              ? rawValue
              : typeof rawValue === 'string'
                ? rawValue
                : String(rawValue ?? '');

          const rawConfidence = f.confidence;
          const confidence: number =
            typeof rawConfidence === 'number'
              ? Math.min(1, Math.max(0, rawConfidence))
              : 0;

          const field: ExtractedField = { fieldName, value, confidence };

          if (typeof f.unit === 'string' && f.unit.trim().length > 0) {
            field.unit = f.unit.trim();
          }
          if (typeof f.referenceRange === 'string' && f.referenceRange.trim().length > 0) {
            field.referenceRange = f.referenceRange.trim();
          }
          if (typeof f.sourceText === 'string' && f.sourceText.trim().length > 0) {
            field.sourceText = f.sourceText.trim().slice(0, MAX_SOURCE_TEXT_CHARS);
          }
          if (typeof f.category === 'string' && f.category.trim().length > 0) {
            field.category = f.category.trim();
          }

          acc.push(field);
          return acc;
        }, [])
        .slice(0, MAX_EXTRACTED_FIELDS);

      // ── unrecognisedContent ───────────────────────────────────────────────
      const unrecognisedContent =
        typeof obj.unrecognisedContent === 'string' && obj.unrecognisedContent.trim().length > 0
          ? obj.unrecognisedContent.trim()
          : undefined;

      const result: DocumentAnalysisResult = {
        // documentType is determined by extractText(), not by the LLM.
        // Callers should patch this after calling extractText().
        documentType: 'text',
        detectedPanels,
        extractedFields,
        rawText,
        analysedAt: now,
      };

      if (unrecognisedContent !== undefined) {
        result.unrecognisedContent = unrecognisedContent;
      }

      return result;
    } catch {
      // JSON.parse threw — LLM returned non-JSON text.
      return { ...emptyResult, unrecognisedContent: 'LLM response was not valid JSON.' };
    }
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private static _blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('[DocumentAnalysisService] FileReader failed to convert blob to data URL'));
      reader.readAsDataURL(blob);
    });
  }
}
