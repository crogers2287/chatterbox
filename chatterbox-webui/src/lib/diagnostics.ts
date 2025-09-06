// Diagnostic utility to check API configuration
export function runDiagnostics() {
  console.log('=== CHATTERBOX TTS DIAGNOSTICS ===');
  console.log('Current URL:', window.location.href);
  console.log('Hostname:', window.location.hostname);
  
  // Check environment variables
  console.log('\nEnvironment Variables:');
  console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
  console.log('VITE_BYPASS_AUTH:', import.meta.env.VITE_BYPASS_AUTH);
  
  // Check API module
  console.log('\nChecking API module...');
  import('./api').then((apiModule) => {
    console.log('API module loaded');
    console.log('axios baseURL:', apiModule.default?.defaults?.baseURL);
  });
  
  // Test actual API calls
  console.log('\nTesting API endpoints...');
  
  // Test load balancer
  fetch('http://fred.taile5e8a3.ts.net:6095/health')
    .then(r => r.json())
    .then(data => console.log('✅ Load Balancer (6095):', data))
    .catch(err => console.error('❌ Load Balancer (6095):', err.message));
  
  // Test direct servers
  fetch('http://fred.taile5e8a3.ts.net:6093/health')
    .then(r => r.json())
    .then(data => console.log('✅ GPU 0 (6093):', data))
    .catch(err => console.error('❌ GPU 0 (6093):', err.message));
    
  fetch('http://fred.taile5e8a3.ts.net:6094/health')
    .then(r => r.json())
    .then(data => console.log('✅ GPU 1 (6094):', data))
    .catch(err => console.error('❌ GPU 1 (6094):', err.message));
  
  console.log('=== END DIAGNOSTICS ===');
  console.log('Run this in the browser console: runDiagnostics()');
}

// Auto-run on load in development
if (import.meta.env.DEV) {
  window.runDiagnostics = runDiagnostics;
  setTimeout(runDiagnostics, 1000);
}