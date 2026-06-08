import { runLiveOpenAiEvaluation } from './liveOpenAiEvaluation.js';

const budgetUsd = Number(process.env.LIVE_OPENAI_EVAL_BUDGET_USD || 5);
const report = await runLiveOpenAiEvaluation({ budgetUsd });

console.log('# Live OpenAI Counseling Evaluation');
console.log('');
console.log(`- OK: ${report.ok ? 'yes' : 'no'}`);
console.log(`- Personas: ${report.summary.personas}`);
console.log(`- Turns: ${report.summary.turns}`);
console.log(`- Failed turns: ${report.summary.failedTurns}`);
console.log(`- OpenAI calls: ${report.summary.calls}`);
console.log(`- Estimated cost: $${report.summary.estimatedCostUsd.toFixed(6)} / $${report.summary.budgetUsd.toFixed(2)}`);
console.log(`- Stopped reason: ${report.summary.stoppedReason ?? 'completed'}`);
console.log('');

for (const persona of report.personas) {
  console.log(`## ${persona.id}`);
  console.log(`- Name: ${persona.name}`);
  console.log(`- Result: ${persona.passed ? 'pass' : 'fail'}`);
  console.log('');

  for (let index = 0; index < persona.turns.length; index += 1) {
    const turn = persona.turns[index];
    console.log(`### Turn ${index + 1}`);
    console.log(`User: ${turn.user}`);
    console.log(`Assistant: ${turn.assistant}`);
    console.log(`Source: ${turn.source}`);
    console.log(`Safety: ${turn.safetyPriority}`);
    console.log(`Severity: ${turn.severity}`);
    console.log(`Dialogue act: ${turn.dialogueAct}`);
    console.log(`RAG: ${turn.ragMatched ? 'matched' : 'none'}`);
    console.log(`Issues: ${turn.issues.length ? turn.issues.map((issue) => issue.code).join(', ') : 'none'}`);
    console.log('');
  }
}

if (report.failures.length > 0) {
  console.log('## Failures');
  for (const failure of report.failures) {
    console.log(`- ${failure.personaId} turn ${failure.turnIndex + 1}: ${failure.issues.map((issue) => issue.code).join(', ')}`);
  }
}

process.exitCode = report.ok ? 0 : 1;
