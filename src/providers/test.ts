/**
 * Provider Test Utilities
 */

import { ProviderConfig } from './index';

export async function testProviderConnection(config: ProviderConfig): Promise<{ success: boolean; error?: string }> {
  try {
    // Simple test - just check if API key is present
    if (!config.apiKey) {
      return { success: false, error: 'API key not configured' };
    }
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}
