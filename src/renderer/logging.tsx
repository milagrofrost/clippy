// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function log(...args: any[]): void {
  console.log(...args.map(formatLogArgument));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatLogArgument(argument: any): string {
  if (typeof argument === "string") {
    return argument;
  }

  if (argument instanceof Error) {
    return `${argument.name}: ${argument.message}`;
  }

  try {
    return JSON.stringify(argument);
  } catch {
    return String(argument);
  }
}
