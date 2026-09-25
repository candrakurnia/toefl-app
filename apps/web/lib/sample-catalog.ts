import { OVERALL_WINDOW_SEC, QuestionType } from '@toefl/shared';

export const SAMPLE_EXAM_ID = 'exam_academic_skills';

export interface SampleQuestion {
  id: string;
  sectionId: string;
  type: QuestionType;
  prompt: string;
  order: number;
  maxScore: number;
  choices?: Array<{ id: string; text: string }>;
  correctChoiceId?: string;
  audioUrl?: string | null;
}

export interface SampleSection {
  id: string;
  name: string;
  durationSec: number;
  order: number;
  questionTypes: QuestionType[];
  questions: SampleQuestion[];
}

export interface SampleExam {
  id: string;
  title: string;
  durationOverall: number;
  rules: string[];
  sections: SampleSection[];
}

/**
 * Practice exam shown when the API does not respond.
 * Listening is answerable from the prompt because the audio file is served by the API.
 */
export const SAMPLE_EXAM: SampleExam = {
  id: SAMPLE_EXAM_ID,
  title: 'Academic Skills Check',
  durationOverall: OVERALL_WINDOW_SEC,
  rules: [
    'This is sample data stored in this browser. It is not a live exam and is not scored by the server.',
    'Mulai opens one practice session. If that session is already open, Lanjutkan returns to its questions.',
    'Each section has its own timer. The overall window is 24 hours from the moment you start.',
    'Answers stay in this browser. Refreshing the tab keeps the session; a new tab starts clean.',
  ],
  sections: [
    {
      id: 'sample_sec_reading',
      name: 'Reading',
      durationSec: 20 * 60,
      order: 1,
      questionTypes: ['multiple_choice'],
      questions: [
        {
          id: 'sample_q_read_1',
          sectionId: 'sample_sec_reading',
          type: 'multiple_choice',
          order: 1,
          maxScore: 1,
          correctChoiceId: 'sample_q_read_1_b',
          prompt:
            'Passage: Campus gardens at several universities now supply the dining hall with herbs and greens. Students who join the weekly harvest shift learn to plan beds around the local frost date, and the dining staff posts which dishes used that week’s pick.\n\nWhat is the main point of the passage?',
          choices: [
            {
              id: 'sample_q_read_1_a',
              text: 'Dining halls have stopped buying vegetables from farms.',
            },
            {
              id: 'sample_q_read_1_b',
              text: 'Student gardens provide food and a way to learn how to grow it.',
            },
            {
              id: 'sample_q_read_1_c',
              text: 'Frost dates make campus gardens impossible to maintain.',
            },
            {
              id: 'sample_q_read_1_d',
              text: 'Only dining staff are allowed to harvest the garden.',
            },
          ],
        },
        {
          id: 'sample_q_read_2',
          sectionId: 'sample_sec_reading',
          type: 'multiple_choice',
          order: 2,
          maxScore: 1,
          correctChoiceId: 'sample_q_read_2_c',
          prompt:
            'The library now loans noise-reducing headphones for three-hour blocks. Students reserve them online. On exam weeks every pair is booked before noon, and the desk keeps a waiting list.\n\nWhat problem does the loan program face?',
          choices: [
            { id: 'sample_q_read_2_a', text: 'Headphones can only be used inside the library.' },
            {
              id: 'sample_q_read_2_b',
              text: 'Students are not allowed to reserve equipment online.',
            },
            {
              id: 'sample_q_read_2_c',
              text: 'Demand is higher than the number of headphones available.',
            },
            { id: 'sample_q_read_2_d', text: 'The waiting list replaces the exam-week schedule.' },
          ],
        },
      ],
    },
    {
      id: 'sample_sec_listening',
      name: 'Listening',
      durationSec: 10 * 60,
      order: 2,
      questionTypes: ['listening'],
      questions: [
        {
          id: 'sample_q_listen_1',
          sectionId: 'sample_sec_listening',
          type: 'listening',
          order: 1,
          maxScore: 1,
          correctChoiceId: 'sample_q_listen_1_a',
          audioUrl: null,
          prompt:
            'Announcement (audio is unavailable in sample mode; the words are written here). The speaker says the writing center will open on Sunday evenings during the two weeks before final exams and that students should book a 30-minute slot online.\n\nWhat is the announcement mainly about?',
          choices: [
            {
              id: 'sample_q_listen_1_a',
              text: 'Extra writing-center hours and how to reserve a time.',
            },
            {
              id: 'sample_q_listen_1_b',
              text: 'A permanent move of the writing center off campus.',
            },
            { id: 'sample_q_listen_1_c', text: 'The cancellation of all Sunday classes.' },
            { id: 'sample_q_listen_1_d', text: 'A new fee for every tutoring appointment.' },
          ],
        },
      ],
    },
    {
      id: 'sample_sec_speaking',
      name: 'Speaking',
      durationSec: 8 * 60,
      order: 3,
      questionTypes: ['speaking'],
      questions: [
        {
          id: 'sample_q_speak_1',
          sectionId: 'sample_sec_speaking',
          type: 'speaking',
          order: 1,
          maxScore: 5,
          prompt:
            'Describe a place where you like to study. Explain why that place helps you concentrate. You may record an answer and attach it to this question.',
        },
      ],
    },
    {
      id: 'sample_sec_writing',
      name: 'Writing',
      durationSec: 20 * 60,
      order: 4,
      questionTypes: ['essay'],
      questions: [
        {
          id: 'sample_q_write_1',
          sectionId: 'sample_sec_writing',
          type: 'essay',
          order: 1,
          maxScore: 5,
          prompt:
            'Do you agree or disagree with the following statement? Universities should require every student to complete a community-service project before graduation. Use specific reasons and examples to support your answer.',
        },
      ],
    },
  ],
};

export function sampleQuestionCount() {
  return SAMPLE_EXAM.sections.reduce((sum, section) => sum + section.questions.length, 0);
}
