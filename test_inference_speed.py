#!/usr/bin/env python3
"""Test inference speed before and after optimizations"""

import time
import torch
import sys
sys.path.append('/home/crogers2287/chatterbox')

from chatterbox.tts import ChatterboxTTS

def test_inference_speed(use_optimized=False):
    """Test the inference speed"""
    print(f"\n{'='*50}")
    print(f"Testing {'OPTIMIZED' if use_optimized else 'REGULAR'} inference")
    print(f"{'='*50}\n")
    
    # Load model
    print("Loading model...")
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    tts = ChatterboxTTS.from_pretrained(device)
    print(f"Model loaded on {device}")
    
    # Test text
    test_text = """This is a test to measure the inference speed of Chatterbox TTS. 
    We want to see how many iterations per second we can achieve with the optimized inference."""
    
    # Warm up
    print("\nWarming up...")
    _ = tts.generate(text=test_text, temperature=0.8)
    
    if torch.cuda.is_available():
        torch.cuda.synchronize()
    
    # Test with regular inference
    print("\nRunning inference test...")
    start_time = time.time()
    
    if use_optimized and hasattr(tts.t3, 'inference_optimized'):
        print("Using optimized inference...")
        # Prepare inputs
        text_tokens = tts.tokenizer(test_text)
        t3_cond = tts.prepare_cond()
        
        # Run optimized inference
        wav = tts.t3.inference_optimized(
            t3_cond=t3_cond,
            text_tokens=text_tokens,
            temperature=0.8,
            min_p=0.05,
            top_p=1.0,
            repetition_penalty=1.2,
            cfg_weight=0.0,
            max_new_tokens=500,
            benchmark_t3=True,
            generate_token_backend="cudagraphs-manual",
        )
    else:
        print("Using regular inference...")
        wav = tts.generate(
            text=test_text,
            temperature=0.8,
            min_p=0.05,
            top_p=1.0,
            repetition_penalty=1.2,
        )
    
    if torch.cuda.is_available():
        torch.cuda.synchronize()
    
    elapsed = time.time() - start_time
    
    print(f"\nTotal time: {elapsed:.2f} seconds")
    
    # Clean up
    del tts
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    
    return elapsed

if __name__ == "__main__":
    # Test regular inference
    regular_time = test_inference_speed(use_optimized=False)
    
    # Load optimized inference
    try:
        from chatterbox.models.t3.inference_optimized import add_optimized_inference_to_t3
        add_optimized_inference_to_t3()
        
        # Test optimized inference
        optimized_time = test_inference_speed(use_optimized=True)
        
        print(f"\n{'='*50}")
        print("PERFORMANCE COMPARISON")
        print(f"{'='*50}")
        print(f"Regular inference: {regular_time:.2f}s")
        print(f"Optimized inference: {optimized_time:.2f}s")
        print(f"Speedup: {regular_time/optimized_time:.2f}x")
        
    except Exception as e:
        print(f"\nCould not test optimized inference: {e}")
        import traceback
        traceback.print_exc()