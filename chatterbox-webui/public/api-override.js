// Force correct API URL for chatter.skinnyc.pro
console.log('[API Override] Injecting correct API configuration...');

// Wait for the page to load
window.addEventListener('DOMContentLoaded', () => {
    // Override any axios instances with the correct base URL
    if (window.location.hostname === 'chatter.skinnyc.pro' && window.location.protocol === 'https:') {
        console.log('[API Override] Detected HTTPS on chatter.skinnyc.pro - forcing /api prefix');
        
        // Override fetch to intercept API calls
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            let url = args[0];
            
            // If it's trying to use the old API URL, redirect to /api
            if (typeof url === 'string') {
                if (url.includes('fred.taile5e8a3.ts.net') || url.includes(':6093') || url.includes(':6095')) {
                    // Extract the path after the domain
                    const urlObj = new URL(url);
                    const newUrl = '/api' + urlObj.pathname + urlObj.search;
                    console.log(`[API Override] Redirecting ${url} to ${newUrl}`);
                    args[0] = newUrl;
                }
            }
            
            return originalFetch.apply(this, args);
        };
        
        // Also override XMLHttpRequest
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            if (typeof url === 'string') {
                if (url.includes('fred.taile5e8a3.ts.net') || url.includes(':6093') || url.includes(':6095')) {
                    try {
                        const urlObj = new URL(url);
                        const newUrl = '/api' + urlObj.pathname + urlObj.search;
                        console.log(`[API Override XMLHttpRequest] Redirecting ${url} to ${newUrl}`);
                        url = newUrl;
                    } catch (e) {
                        // If URL parsing fails, just prepend /api
                        if (!url.startsWith('/api') && !url.startsWith('http')) {
                            url = '/api/' + url;
                        }
                    }
                }
            }
            return originalOpen.call(this, method, url, ...rest);
        };
        
        console.log('[API Override] Fetch and XMLHttpRequest interceptors installed');
    }
});