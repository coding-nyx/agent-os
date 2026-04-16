import { describe, expect, it, vi } from 'vitest';
import { prepareDocumentChatPrompt } from './document-chat-handoff-service';
import { buildDocumentUploadVisibleMessage, parseDocumentUploadMessage } from './document-upload-message';

describe('prepareDocumentChatPrompt', () => {
  it('builds a combined prompt for multiple uploaded documents with classifier metadata', async () => {
    const sendMessage = vi.fn<(_: string) => Promise<string>>().mockImplementation(async (prompt: string) => {
      if (prompt.includes('Pass 1 (classification)') && prompt.includes('prescription.txt')) {
        return JSON.stringify({
          docType: 'prescription',
          targetModule: 'soma',
          confidence: 0.92,
          reasons: ['Contains dosage and Rx terms'],
        });
      }
      if (prompt.includes('Pass 1 (classification)') && prompt.includes('hospital-bill.txt')) {
        return JSON.stringify({
          docType: 'hospital_bill',
          targetModule: 'ledger',
          confidence: 0.88,
          reasons: ['Contains bill totals and charges'],
        });
      }
      if (prompt.includes('Pass 2 (specialized analysis)') && prompt.includes('prescription.txt')) {
        return JSON.stringify({
          category: 'prescription',
          summary: 'This prescription outlines two medications for short-term treatment.',
          keyPoints: ['Amoxicillin twice daily', 'Take after food'],
          followUpTopics: ['Duration of treatment'],
        });
      }
      if (prompt.includes('Pass 2 (specialized analysis)') && prompt.includes('hospital-bill.txt')) {
        return JSON.stringify({
          category: 'hospital_bill',
          summary: 'This bill lists visit charges and an outstanding balance.',
          keyPoints: ['Outstanding balance remains', 'Imaging fee listed separately'],
          followUpTopics: ['Insurance coverage'],
        });
      }
      return JSON.stringify({
        category: 'other',
        summary: 'Fallback summary',
        keyPoints: [],
        followUpTopics: [],
      });
    });

    const files = [
      new File(['Prescription for amoxicillin. Take after food.'], 'prescription.txt', { type: 'text/plain' }),
      new File(['Hospital bill with imaging fee and balance due.'], 'hospital-bill.txt', { type: 'text/plain' }),
    ];

    const result = await prepareDocumentChatPrompt({
      moduleId: 'soma',
      files,
      sendMessage,
    });

    expect(result.insights).toHaveLength(2);
    expect(result.insights[0]?.docType).toBe('prescription');
    expect(result.insights[0]?.targetModule).toBe('soma');
    expect(result.insights[1]?.docType).toBe('hospital_bill');
    expect(result.insights[1]?.targetModule).toBe('ledger');
    expect(result.prompt).toContain('Classified type: prescription');
    expect(result.prompt).toContain('Routing hint: Best owner appears to be ledger');
    expect(result.prompt).toContain('Synthesize across the full set.');
  });

  it('requests user type confirmation when classification confidence is low', async () => {
    const sendMessage = vi.fn<(_: string) => Promise<string>>().mockResolvedValue(
      JSON.stringify({
        docType: 'unknown',
        targetModule: 'ara',
        confidence: 0.2,
        reasons: ['Insufficient signal'],
      }),
    );

    const result = await prepareDocumentChatPrompt({
      moduleId: 'ara',
      files: [new File(['ambiguous content'], 'ambiguous.txt', { type: 'text/plain' })],
      sendMessage,
    });

    expect(result.insights).toHaveLength(1);
    expect(result.insights[0]?.requiresUserTypeSelection).toBe(true);
    expect(result.insights[0]?.summary).toContain('Please confirm the document type');
    expect(result.prompt).toContain('Type confirmation needed');
  });

  it('uses visual analysis when OCR text is just a refusal message', async () => {
    const sendMessage = vi.fn<(_: string) => Promise<string>>().mockImplementation(async (prompt: string) => {
      if (prompt.includes('Pass 1 (classification)')) {
        return JSON.stringify({
          docType: 'medical_image',
          targetModule: 'ara',
          confidence: 0.91,
          reasons: ['Image upload with minimal OCR'],
        });
      }
      return 'I am sorry, but I cannot extract text from that image.';
    });

    const analyzeImage = vi
      .fn<(_: string, __: string) => Promise<string>>()
      .mockResolvedValue(JSON.stringify({
        category: 'comic_character',
        summary: 'The image appears to show Spider-Man in costume artwork.',
        keyPoints: ['Red and blue costume', 'Comic-style character art'],
        followUpTopics: ['Identify which Spider-Man version this is'],
      }));

    const result = await prepareDocumentChatPrompt({
      moduleId: 'ara',
      files: [new File(['fake'], 'image.png', { type: 'image/png' })],
      sendMessage,
      analyzeImage,
    });

    expect(analyzeImage).toHaveBeenCalledTimes(1);
    expect(result.insights[0]?.category).toBe('comic_character');
    expect(result.insights[0]?.summary).toContain('Spider-Man');
    expect(result.insights[0]?.preview).toBe('');
  });

  it('builds a visible upload message with caption and image preview metadata', async () => {
    const visible = await buildDocumentUploadVisibleMessage(
      [new File(['hello'], 'image.png', { type: 'image/png' })],
      'Check whether this is Spider-Man',
    );

    const parsed = parseDocumentUploadMessage(visible);
    expect(parsed).not.toBeNull();
    expect(parsed?.caption).toBe('Check whether this is Spider-Man');
    expect(parsed?.files[0]?.name).toBe('image.png');
    expect(parsed?.files[0]?.previewDataUrl?.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('parses persisted upload payloads even when wrapper markers are missing', () => {
    const parsed = parseDocumentUploadMessage(
      JSON.stringify({
        kind: 'document_upload',
        caption: 'read the report',
        files: [
          {
            name: 'large.png',
            mimeType: 'image/png',
            fileType: 'image',
            sizeBytes: 51367,
            previewDataUrl: 'data:image/png;base64,abc123',
          },
        ],
      }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.caption).toBe('read the report');
    expect(parsed?.files[0]?.name).toBe('large.png');
    expect(parsed?.files[0]?.previewDataUrl).toBe('data:image/png;base64,abc123');
  });
});
