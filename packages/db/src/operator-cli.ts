import { parseOperatorCommand, operatorHelp, runDatabaseOperator } from './operator.js';

if (process.argv.slice(2).length === 1 && process.argv[2] === '--help') console.log(operatorHelp);
else {
  try {
    const command = parseOperatorCommand(process.argv.slice(2));
    if (command.envFile) process.loadEnvFile(command.envFile);
    await runDatabaseOperator(command, process.env);
    console.log('Database operator command completed. No initial accounts or project data were created.');
  } catch {
    console.error('Database operator command refused or failed. Check --help, exact database confirmation, connectivity, archive and PostgreSQL tools. Credentials and database diagnostics are not printed.');
    process.exitCode = 1;
  }
}
