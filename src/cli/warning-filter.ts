/**
 * Process warning filter
 */

export function installProcessWarningFilter(): void {
  // Filter out common warnings
  const originalEmit = (process as any).emit;
  (process as any).emit = function(event: string | symbol, ...args: any[]) {
    if (event === 'warning' && args[0] instanceof Error) {
      const warning = args[0];
      // Filter specific warnings
      if (warning.message?.includes('ExperimentalWarning')) {
        return true;
      }
    }
    return originalEmit.apply(this, [event, ...args]);
  };
}
