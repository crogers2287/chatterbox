/**
 * Legacy store file - now redirects to the new persisted store
 * This maintains compatibility during the migration to persistence
 */

// Re-export everything from the new persisted store
export * from './store/index';

// For backward compatibility, also export the main hook as default
import { useStore } from './store/index';
export default useStore;