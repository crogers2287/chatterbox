#!/usr/bin/env python3
"""
Launch script for Chatterbox Audiobook Edition
"""
import os
import sys
import subprocess

# Add the audiobook src to Python path
audiobook_path = os.path.join(os.path.dirname(__file__), 'chatterbox-Audiobook')
sys.path.insert(0, audiobook_path)

# Check if we should launch the simple or batch version
if len(sys.argv) > 1 and sys.argv[1] == '--batch':
    script = 'gradio_tts_app_audiobook_with_batch.py'
else:
    script = 'gradio_tts_app_audiobook.py'

script_path = os.path.join(audiobook_path, script)

# Launch the audiobook app
if os.path.exists(script_path):
    print(f"Launching Chatterbox Audiobook Edition...")
    print(f"Script: {script}")
    subprocess.run([sys.executable, script_path] + sys.argv[2:])
else:
    print(f"Error: Could not find {script}")
    print(f"Looked in: {script_path}")
    sys.exit(1)