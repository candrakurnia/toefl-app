import { PrismaClient } from '@prisma/client';
import { OVERALL_WINDOW_SEC } from '@toefl/shared';

const prisma = new PrismaClient();

const EXAM_ID = 'exam_practice_1';

async function main() {
  const existing = await prisma.exam.findUnique({ where: { id: EXAM_ID } });
  if (existing) {
    console.log(`Exam ${EXAM_ID} already exists; seed skipped.`);
    return;
  }

  await prisma.exam.create({
    data: {
      id: EXAM_ID,
      title: 'TOEFL iBT Practice Test 1',
      durationOverall: OVERALL_WINDOW_SEC,
      rules: [
        'The overall window is 24 hours from the moment you start. The server clock is authoritative.',
        'Each section has its own timer. When a section timer ends, the server advances you or submits the test.',
        'Leaving fullscreen or switching tabs is logged. Neither timer pauses.',
        'Answers autosave. Essay and speaking responses are scored after you submit.',
        'You may have one active session for this exam. Submit it before starting another.',
      ],
      sections: {
        create: [
          {
            id: 'sec_reading',
            name: 'Reading',
            durationSec: 20 * 60,
            order: 1,
            questions: {
              create: [
                {
                  id: 'q_read_1',
                  type: 'multiple_choice',
                  order: 1,
                  maxScore: 1,
                  correctChoiceId: 'q_read_1_b',
                  prompt:
                    'Passage: Arctic terns migrate farther than any other bird, flying from Arctic breeding grounds to the Antarctic and back each year. Researchers tracking tagged terns found that the birds rarely fly in a straight line. They detour toward prevailing winds and productive feeding waters.\n\nWhy do the terns leave a direct route?',
                  choices: [
                    { id: 'q_read_1_a', text: 'They lose their way once the sun sets.' },
                    {
                      id: 'q_read_1_b',
                      text: 'They follow winds and feeding areas that make the journey possible.',
                    },
                    {
                      id: 'q_read_1_c',
                      text: 'They are required to stop at fixed research stations.',
                    },
                    { id: 'q_read_1_d', text: 'They migrate only along continental coastlines.' },
                  ],
                },
                {
                  id: 'q_read_2',
                  type: 'multiple_choice',
                  order: 2,
                  maxScore: 1,
                  correctChoiceId: 'q_read_2_c',
                  prompt:
                    'The passage notes that public libraries in several cities now lend wireless hotspots for several weeks at a time. Patrons who cannot afford home broadband use the devices for schoolwork and job applications. Demand often exceeds the number of hotspots available.\n\nWhat problem does the lending program face?',
                  choices: [
                    {
                      id: 'q_read_2_a',
                      text: 'Patrons are not allowed to use the hotspots for schoolwork.',
                    },
                    {
                      id: 'q_read_2_b',
                      text: 'The hotspots function only inside the library building.',
                    },
                    {
                      id: 'q_read_2_c',
                      text: 'There are fewer devices than people who want to borrow them.',
                    },
                    { id: 'q_read_2_d', text: 'Cities have banned wireless lending altogether.' },
                  ],
                },
              ],
            },
          },
          {
            id: 'sec_listening',
            name: 'Listening',
            durationSec: 10 * 60,
            order: 2,
            questions: {
              create: [
                {
                  id: 'q_listen_1',
                  type: 'listening',
                  order: 1,
                  maxScore: 1,
                  correctChoiceId: 'q_listen_1_a',
                  audioUrl: null,
                  prompt:
                    'Listen to a short campus announcement (audio placeholder for this sample). The speaker says the writing center will open on Sunday evenings during the two weeks before final exams and that students should book a 30-minute slot online.\n\nWhat is the announcement mainly about?',
                  choices: [
                    {
                      id: 'q_listen_1_a',
                      text: 'Extra writing-center hours and how to reserve a time.',
                    },
                    {
                      id: 'q_listen_1_b',
                      text: 'A permanent move of the writing center off campus.',
                    },
                    { id: 'q_listen_1_c', text: 'The cancellation of all Sunday classes.' },
                    { id: 'q_listen_1_d', text: 'A new fee for every tutoring appointment.' },
                  ],
                },
              ],
            },
          },
          {
            id: 'sec_speaking',
            name: 'Speaking',
            durationSec: 8 * 60,
            order: 3,
            questions: {
              create: [
                {
                  id: 'q_speak_1',
                  type: 'speaking',
                  order: 1,
                  maxScore: 5,
                  prompt:
                    'Describe a place where you like to study. Explain why that place helps you concentrate. You may record an answer and attach it to this question.',
                },
              ],
            },
          },
          {
            id: 'sec_writing',
            name: 'Writing',
            durationSec: 20 * 60,
            order: 4,
            questions: {
              create: [
                {
                  id: 'q_write_1',
                  type: 'essay',
                  order: 1,
                  maxScore: 5,
                  prompt:
                    'Do you agree or disagree with the following statement? Universities should require every student to complete a community-service project before graduation. Use specific reasons and examples to support your answer.',
                },
              ],
            },
          },
        ],
      },
    },
  });

  console.log(`Seeded exam ${EXAM_ID}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
