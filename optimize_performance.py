#!/usr/bin/env python3
"""
Performance optimization script for Chatterbox TTS
Tests various optimization techniques to improve generation speed
"""

import torch
import time
from chatterbox.tts import ChatterboxTTS

def test_generation_speed(model, text="Hello, this is a test of generation speed.", runs=3):
    """Test generation speed with timing"""
    times = []
    
    for i in range(runs):
        torch.cuda.synchronize()
        start = time.time()
        
        wav = model.generate(
            text=text,
            temperature=0.8,
            exaggeration=0.5,
            cfg_weight=0.5,
            min_p=0.05,
            top_p=1.0,
            repetition_penalty=1.2
        )
        
        torch.cuda.synchronize()
        end = time.time()
        
        duration = end - start
        times.append(duration)
        print(f"Run {i+1}: {duration:.2f}s")
    
    avg_time = sum(times) / len(times)
    print(f"\nAverage generation time: {avg_time:.2f}s")
    return avg_time

def main():
    print("Loading Chatterbox TTS model...")
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    
    # Enable optimization flags
    if torch.cuda.is_available():
        torch.backends.cudnn.benchmark = True
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
    
    model = ChatterboxTTS.from_pretrained(device)
    
    print("\nTesting baseline performance...")
    baseline_time = test_generation_speed(model)
    
    # Test with torch.compile (if available)
    if hasattr(torch, 'compile') and torch.cuda.is_available():
        print("\nTrying torch.compile optimization...")
        try:
            # Compile the key models
            model.t3 = torch.compile(model.t3, mode="reduce-overhead")
            model.s3gen = torch.compile(model.s3gen, mode="reduce-overhead")
            
            print("\nTesting with torch.compile...")
            compiled_time = test_generation_speed(model)
            
            speedup = baseline_time / compiled_time
            print(f"\nSpeedup with torch.compile: {speedup:.2f}x")
        except Exception as e:
            print(f"torch.compile failed: {e}")
    
    # Test batch size effect
    print("\nTesting different text lengths...")
    texts = [
        "Short text.",
        "This is a medium length text to test generation speed.",
        "This is a longer text to test how the generation speed scales with text length. The model should handle this efficiently."
    ]
    
    for text in texts:
        print(f"\nText length: {len(text)} chars")
        test_generation_speed(model, text, runs=1)

if __name__ == "__main__":
    main()