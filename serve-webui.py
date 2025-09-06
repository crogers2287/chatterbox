#!/usr/bin/env python3
"""
Simple development server for Chatterbox WebUI
Runs the Vite dev server via subprocess
"""
import subprocess
import sys
import os
import signal

def main():
    # Change to WebUI directory
    os.chdir('/home/crogers2287/chatterbox/chatterbox-webui')
    
    # Set up environment
    env = os.environ.copy()
    env['PATH'] = '/home/crogers2287/chatterbox/chatterbox-webui/node_modules/.bin:' + env.get('PATH', '')
    
    print("Starting Chatterbox WebUI development server...")
    
    # Run vite directly
    proc = subprocess.Popen(
        ['./node_modules/.bin/vite', '--host', '0.0.0.0'],
        env=env,
        stdout=sys.stdout,
        stderr=sys.stderr
    )
    
    # Handle signals
    def signal_handler(signum, frame):
        proc.terminate()
        sys.exit(0)
    
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    # Wait for process
    proc.wait()

if __name__ == '__main__':
    main()