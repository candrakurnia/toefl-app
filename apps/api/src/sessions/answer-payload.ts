import { BadRequestException } from '@nestjs/common';
import { AnswerPayload, QuestionType } from '@toefl/shared';

interface Choice {
  id: string;
  text: string;
}

export function parseChoices(value: unknown): Choice[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) return undefined;
  const choices: Choice[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return undefined;
    const record = item as { id?: unknown; text?: unknown };
    if (typeof record.id !== 'string' || typeof record.text !== 'string') return undefined;
    choices.push({ id: record.id, text: record.text });
  }
  return choices;
}

export function parseAnswerPayload(value: unknown): AnswerPayload | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as {
    kind?: unknown;
    choiceId?: unknown;
    text?: unknown;
    mediaId?: unknown;
    url?: unknown;
  };
  if (record.kind === 'choice' && typeof record.choiceId === 'string') {
    return { kind: 'choice', choiceId: record.choiceId };
  }
  if (record.kind === 'essay' && typeof record.text === 'string') {
    return { kind: 'essay', text: record.text };
  }
  if (record.kind === 'speaking' && typeof record.mediaId === 'string') {
    const payload: AnswerPayload = { kind: 'speaking', mediaId: record.mediaId };
    if (typeof record.url === 'string' && record.url.length > 0) payload.url = record.url;
    return payload;
  }
  return null;
}

export function assertPayloadForQuestion(
  type: QuestionType,
  payload: unknown,
  choices: Choice[] | undefined,
): AnswerPayload {
  const parsed = parseAnswerPayload(payload);
  if (!parsed) {
    throw new BadRequestException('payload is invalid');
  }
  if (type === 'essay') {
    if (parsed.kind !== 'essay')
      throw new BadRequestException('essay answers require kind "essay"');
    if (parsed.text.length > 10000) throw new BadRequestException('essay text is too long');
    return parsed;
  }
  if (type === 'speaking') {
    if (parsed.kind !== 'speaking') {
      throw new BadRequestException('speaking answers require kind "speaking"');
    }
    return parsed;
  }
  if (parsed.kind !== 'choice') {
    throw new BadRequestException('this question requires kind "choice"');
  }
  if (choices && !choices.some((choice) => choice.id === parsed.choiceId)) {
    throw new BadRequestException('choiceId is not one of the question choices');
  }
  return parsed;
}
