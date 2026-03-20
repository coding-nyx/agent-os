import { describe, expect, it, vi } from 'vitest';
import { prepareDocumentChatPrompt } from './document-chat-handoff-service';
import { buildDocumentUploadVisibleMessage, parseDocumentUploadMessage } from './document-upload-message';

describe('prepareDocumentChatPrompt', () => {
  it('builds a combined prompt for multiple uploaded documents', async () => {
    const sendMessage = vi
      .fn<(_: string) => Promise<string>>()
      .mockResolvedValueOnce(JSON.stringify({
        category: 'prescription',
        summary: 'This prescription outlines two medications for short-term treatment.',
        keyPoints: ['Amoxicillin twice daily', 'Take after food'],
        followUpTopics: ['Duration of treatment'],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        category: 'hospital_bill',
        summary: 'This bill lists the visit charges and an outstanding balance.',
        keyPoints: ['Outstanding balance remains', 'Imaging fee listed separately'],
        followUpTopics: ['Insurance coverage'],
      }));

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
    expect(result.insights[0]?.category).toBe('prescription');
    expect(result.insights[1]?.category).toBe('hospital_bill');
    expect(result.prompt).toContain('I uploaded 2 related documents for one combined analysis in soma.');
    expect(result.prompt).toContain('Document 1: prescription.txt');
    expect(result.prompt).toContain('Document 2: hospital-bill.txt');
    expect(result.prompt).toContain('Synthesize across the full set.');
  });

  it('falls back to raw summaries when the triage response is not valid JSON', async () => {
    const sendMessage = vi
      .fn<(_: string) => Promise<string>>()
      .mockResolvedValue('Chest X-ray shows no acute fracture.');

    const result = await prepareDocumentChatPrompt({
      moduleId: 'soma',
      files: [new File(['Chest x-ray report with no acute fracture.'], 'chest-xray.txt', { type: 'text/plain' })],
      sendMessage,
    });

    expect(result.insights).toHaveLength(1);
    expect(result.insights[0]?.category).toBe('imaging');
    expect(result.insights[0]?.summary).toBe('Chest X-ray shows no acute fracture.');
    expect(result.warnings.some((warning) => warning.includes('not valid JSON'))).toBe(true);
  });

  it('uses visual analysis when OCR text is just a refusal message', async () => {
    const sendMessage = vi
      .fn<(_: string) => Promise<string>>()
      .mockResolvedValue('I am sorry, but I cannot extract text from that image.');
    const analyzeImage = vi
      .fn<(_: string, __: string) => Promise<string>>()
      .mockResolvedValue(JSON.stringify({
        category: 'comic_character',
        summary: 'The image appears to show Spider-Man in costume artwork.',
        keyPoints: ['Red and blue costume', 'Comic-style character art'],
        followUpTopics: ['Identify which Spider-Man version this is'],
      }));

    const result = await prepareDocumentChatPrompt({
      moduleId: 'nexus',
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
