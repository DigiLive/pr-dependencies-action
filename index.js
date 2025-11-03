const evaluate = require('./src/pr-dependency-checker.ts');

async function run() {
    await evaluate.evaluate();
}

run().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
