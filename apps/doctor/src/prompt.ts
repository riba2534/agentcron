// readline 交互式 confirm，避免引入 prompts 依赖。
import readline from 'node:readline';

export async function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    process.stderr.write(`stdin not a TTY; cannot prompt: ${question}\n`);
    return '';
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise<string>((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });
  } finally {
    rl.close();
  }
}

export async function confirmYesNo(question: string): Promise<boolean> {
  const a = await ask(`${question} [y/N]: `);
  return a.toLowerCase() === 'y' || a.toLowerCase() === 'yes';
}
