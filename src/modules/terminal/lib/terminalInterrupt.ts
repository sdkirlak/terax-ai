const INTERRUPT = "\x03";

export function hasTerminalInterrupt(data: string): boolean {
  return data.includes(INTERRUPT);
}
