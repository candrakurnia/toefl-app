import { Answer, Question, Section } from '@prisma/client';
import {
  AnswerPayload,
  AttemptDetail,
  QuestionType,
  ScoredAnswer,
  SectionScore,
} from '@toefl/shared';
import { parseAnswerPayload } from './answer-payload';

type ExamSection = Section & { questions: Question[] };

const QUESTION_TYPES = new Set<string>(['multiple_choice', 'essay', 'listening', 'speaking']);

function asQuestionType(value: string): QuestionType {
  if (!QUESTION_TYPES.has(value)) {
    throw new Error(`Unknown question type ${value}`);
  }
  return value as QuestionType;
}

export function buildAttemptResult(
  sections: ExamSection[],
  answers: Answer[],
): Pick<AttemptDetail, 'sectionScores' | 'answers'> {
  const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const scoredAnswers: ScoredAnswer[] = [];

  for (const section of sections) {
    const questions = [...section.questions].sort((a, b) => a.order - b.order);
    for (const question of questions) {
      const type = asQuestionType(question.type);
      const saved = byQuestion.get(question.id);
      const payload = saved ? parseAnswerPayload(saved.payload) : null;
      scoredAnswers.push(scoreOne(question, section.id, type, payload));
    }
  }

  const sectionScores: SectionScore[] = sections.map((section) => {
    const sectionAnswers = scoredAnswers.filter((answer) => answer.sectionId === section.id);
    const maxScore = section.questions.reduce((sum, question) => sum + question.maxScore, 0);
    const waiting = sectionAnswers.some(
      (answer) => answer.scoreStatus === 'pending' || answer.score === null,
    );
    return {
      sectionId: section.id,
      name: section.name,
      maxScore,
      score: waiting ? null : sectionAnswers.reduce((sum, answer) => sum + (answer.score ?? 0), 0),
    };
  });

  return { sectionScores, answers: scoredAnswers };
}

function scoreOne(
  question: Question,
  sectionId: string,
  type: QuestionType,
  payload: AnswerPayload | null,
): ScoredAnswer {
  if (type === 'essay' || type === 'speaking') {
    return {
      questionId: question.id,
      sectionId,
      type,
      payload,
      scoreStatus: 'pending',
      score: null,
    };
  }

  const choiceId = payload?.kind === 'choice' ? payload.choiceId : undefined;
  const correct = Boolean(
    choiceId && question.correctChoiceId && choiceId === question.correctChoiceId,
  );
  return {
    questionId: question.id,
    sectionId,
    type,
    payload,
    correct,
    scoreStatus: 'scored',
    score: correct ? question.maxScore : 0,
  };
}
