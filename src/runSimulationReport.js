import { runSimulationSuite } from './simulation.js';

const report = await runSimulationSuite();

console.log(`# Virtual Counseling Simulation Report`);
console.log('');
console.log(`- Personas: ${report.summary.personas}`);
console.log(`- Turns: ${report.summary.turns}`);
console.log(`- Failed turns: ${report.summary.failedTurns}`);
console.log(`- RAG matched turns: ${report.summary.ragMatchedTurns}`);
console.log('');

for (const persona of report.personas) {
  console.log(`## ${persona.id}`);
  console.log(`- Name: ${persona.name}`);
  console.log(`- Result: ${persona.passed ? 'pass' : 'fail'}`);
  console.log('');

  persona.turns.forEach((turn, index) => {
    console.log(`### Turn ${index + 1}`);
    console.log(`User: ${turn.user}`);
    console.log('');
    console.log(`Assistant: ${turn.assistant}`);
    console.log('');
    console.log(`Dialogue act: ${turn.dialogueAct}`);
    console.log(`Severity: ${turn.severity}`);
    console.log(`RAG: ${turn.rag.available ? `${turn.rag.matchCount} matched` : 'none'}`);
    console.log(`Report: ${turn.report.display?.currentHypothesisText ?? turn.report.currentHypothesis.label} / ${turn.report.intensity.level}`);
    console.log(`User summary: ${turn.report.userSummary?.text ?? 'none'}`);
    console.log(`User resources: ${turn.report.userSummary?.resourceText ?? 'none'}`);
    console.log(
      `Counselor review: ${turn.report.counselorReview?.supportIntensity ?? 'none'}; RAG ${turn.report.counselorReview?.ragSupportText ?? 'none'}`,
    );
    console.log(`Protective factors: ${turn.report.counselorReview?.protectiveFactorSummary ?? 'none'}`);
    console.log(`Issues: ${turn.issues.length > 0 ? turn.issues.join(', ') : 'none'}`);
    console.log('');
  });
}
