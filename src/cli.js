const readline = require('readline');
const { executeSELECTQuery, executeDELETEQuery, executeINSERTQuery } = require('./index');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.setPrompt('SQL> ');
console.log('SQL Query Engine CLI. Enter your SQL commands, or type "exit" to quit.');

rl.prompt();

rl.on('line', async (line) => {
    if (line.toLowerCase() === 'exit') {
        rl.close();
        return;
    }

    try {
        // Execute the query - do your own implementation
    } catch (error) {
        console.error('Error:', error.message);
    }

    rl.prompt();
}).on('close', () => {
    console.log('Exiting SQL CLI');
    process.exit(0);
});