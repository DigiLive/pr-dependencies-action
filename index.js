const evaluate = require('./evaluate-dependencies');

async function run() {
    await evaluate.evaluate();
}

run().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});