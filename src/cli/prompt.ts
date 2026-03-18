/**
 * CLI Prompt utilities
 */

import { text, confirm as clackConfirm, select } from '@clack/prompts';

export async function prompt(message: string, options: { default?: string } = {}): Promise<string> {
  const result = await text({
    message,
    defaultValue: options.default,
  });
  
  if (typeof result !== 'string') {
    throw new Error('Prompt cancelled');
  }
  
  return result;
}

export async function confirm(message: string): Promise<boolean> {
  const result = await clackConfirm({
    message,
  });
  
  if (typeof result !== 'boolean') {
    throw new Error('Prompt cancelled');
  }
  
  return result;
}

export async function selectOption<T extends string>(message: string, options: { value: T; label: string }[]): Promise<T> {
  const mappedOptions = options.map(o => ({ value: o.value, label: o.label }));
  const result = await select({
    message,
    options: mappedOptions as any,
  });
  
  if (result === undefined) {
    throw new Error('Prompt cancelled');
  }
  
  return result as T;
}
