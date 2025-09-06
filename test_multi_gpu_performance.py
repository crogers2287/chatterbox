#!/usr/bin/env python3
"""
Multi-GPU Performance Test for Chatterbox TTS
Tests various GPU configurations and benchmarks performance
"""

import os
import time
import torch
import numpy as np
from contextlib import contextmanager
import psutil
import GPUtil

def print_gpu_info():
    """Print detailed GPU information"""
    print("=" * 80)
    print("GPU INFORMATION")
    print("=" * 80)
    
    # PyTorch CUDA info
    print(f"PyTorch CUDA Available: {torch.cuda.is_available()}")
    print(f"PyTorch CUDA Version: {torch.version.cuda}")
    print(f"Number of GPUs: {torch.cuda.device_count()}")
    print()
    
    # Detailed info for each GPU
    for i in range(torch.cuda.device_count()):
        print(f"GPU {i}: {torch.cuda.get_device_name(i)}")
        props = torch.cuda.get_device_properties(i)
        print(f"  Total Memory: {props.total_memory / 1024**3:.2f} GB")
        print(f"  Memory Allocated: {torch.cuda.memory_allocated(i) / 1024**3:.2f} GB")
        print(f"  Memory Cached: {torch.cuda.memory_reserved(i) / 1024**3:.2f} GB")
        print(f"  Multi-Processor Count: {props.multi_processor_count}")
        print(f"  Compute Capability: {props.major}.{props.minor}")
        print()
    
    # GPUtil info
    print("GPUtil Information:")
    gpus = GPUtil.getGPUs()
    for gpu in gpus:
        print(f"  GPU {gpu.id}: {gpu.name}")
        print(f"    Load: {gpu.load * 100:.1f}%")
        print(f"    Memory: {gpu.memoryUsed}/{gpu.memoryTotal} MB ({gpu.memoryUtil * 100:.1f}%)")
        print(f"    Temperature: {gpu.temperature}°C")
        print()

@contextmanager
def timer(name):
    """Context manager for timing operations"""
    start = time.time()
    yield
    end = time.time()
    print(f"{name}: {end - start:.4f} seconds")

def test_single_gpu_load():
    """Test loading the model on a single GPU"""
    print("=" * 80)
    print("SINGLE GPU TEST (GPU 0)")
    print("=" * 80)
    
    os.environ['CUDA_VISIBLE_DEVICES'] = '0'
    device = "cuda:0"
    
    try:
        from chatterbox.tts import ChatterboxTTS
        
        with timer("Model loading on GPU 0"):
            model = ChatterboxTTS.from_pretrained(device)
        
        # Test synthesis
        test_text = "This is a test of single GPU performance. Let's see how fast we can generate speech."
        
        with timer("First synthesis (includes compilation)"):
            wav = model.generate(text=test_text)
        
        # Warm up
        for _ in range(3):
            model.generate(text="Warmup")
        
        # Benchmark
        num_runs = 10
        times = []
        
        for i in range(num_runs):
            torch.cuda.synchronize()
            start = time.time()
            wav = model.generate(text=test_text)
            torch.cuda.synchronize()
            end = time.time()
            times.append(end - start)
        
        avg_time = np.mean(times)
        std_time = np.std(times)
        
        print(f"\nBenchmark Results (n={num_runs}):")
        print(f"  Average time: {avg_time:.4f} ± {std_time:.4f} seconds")
        print(f"  Min time: {np.min(times):.4f} seconds")
        print(f"  Max time: {np.max(times):.4f} seconds")
        
        # Cleanup
        del model
        torch.cuda.empty_cache()
        
    except Exception as e:
        print(f"Error in single GPU test: {e}")

def test_multi_gpu_data_parallel():
    """Test using DataParallel for multi-GPU"""
    print("\n" + "=" * 80)
    print("MULTI-GPU TEST (DataParallel)")
    print("=" * 80)
    
    # Reset environment to use all GPUs
    if 'CUDA_VISIBLE_DEVICES' in os.environ:
        del os.environ['CUDA_VISIBLE_DEVICES']
    
    if torch.cuda.device_count() < 2:
        print("Less than 2 GPUs available, skipping multi-GPU test")
        return
    
    try:
        from chatterbox.tts import ChatterboxTTS
        
        # Load model on primary GPU first
        with timer("Model loading"):
            model = ChatterboxTTS.from_pretrained("cuda:0")
        
        # Wrap models in DataParallel
        print("\nWrapping models in DataParallel...")
        model.t3 = torch.nn.DataParallel(model.t3, device_ids=[0, 1])
        model.s3gen = torch.nn.DataParallel(model.s3gen, device_ids=[0, 1])
        model.ve = torch.nn.DataParallel(model.ve, device_ids=[0, 1])
        
        # Test synthesis
        test_text = "This is a test of multi-GPU performance using DataParallel. We should see both GPUs being utilized."
        
        print("\nTesting multi-GPU synthesis...")
        with timer("First synthesis (multi-GPU)"):
            wav = model.generate(text=test_text)
        
        print("\nNote: DataParallel may not provide speedup for inference due to communication overhead.")
        
        # Cleanup
        del model
        torch.cuda.empty_cache()
        
    except Exception as e:
        print(f"Error in multi-GPU test: {e}")
        import traceback
        traceback.print_exc()

def test_batch_processing():
    """Test batch processing capabilities"""
    print("\n" + "=" * 80)
    print("BATCH PROCESSING TEST")
    print("=" * 80)
    
    # Use first GPU
    os.environ['CUDA_VISIBLE_DEVICES'] = '0'
    device = "cuda:0"
    
    try:
        from chatterbox.tts import ChatterboxTTS
        
        model = ChatterboxTTS.from_pretrained(device)
        
        # Test different batch sizes
        batch_sizes = [1, 2, 4, 8]
        test_texts = [
            "This is the first sentence in our batch.",
            "Here's another sentence for testing.",
            "Testing batch processing performance.",
            "Fourth sentence in the batch.",
            "Fifth test sentence here.",
            "Sixth sentence for testing.",
            "Seventh sentence in batch.",
            "Eighth and final test sentence."
        ]
        
        print("\nBatch Processing Results:")
        print("Batch Size | Total Time | Time per Item")
        print("-" * 45)
        
        for batch_size in batch_sizes:
            if batch_size > len(test_texts):
                continue
            
            batch_texts = test_texts[:batch_size]
            
            torch.cuda.synchronize()
            start = time.time()
            
            # Process batch sequentially (as model may not support true batching)
            for text in batch_texts:
                wav = model.generate(text=text)
            
            torch.cuda.synchronize()
            end = time.time()
            
            total_time = end - start
            time_per_item = total_time / batch_size
            
            print(f"    {batch_size:2d}     | {total_time:10.4f} | {time_per_item:10.4f}")
        
        # Cleanup
        del model
        torch.cuda.empty_cache()
        
    except Exception as e:
        print(f"Error in batch processing test: {e}")

def suggest_optimizations():
    """Suggest optimizations based on the system configuration"""
    print("\n" + "=" * 80)
    print("OPTIMIZATION SUGGESTIONS")
    print("=" * 80)
    
    num_gpus = torch.cuda.device_count()
    
    if num_gpus == 2:
        print("You have 2 RTX 3090 GPUs. Here are optimization suggestions:")
        print()
        print("1. CURRENT CONFIGURATION:")
        print("   - The API server is currently using only GPU 0 (CUDA_VISIBLE_DEVICES=0)")
        print("   - GPU 0 has 9.1 GB memory used (likely by the TTS model)")
        print("   - GPU 1 has only 64 MB used (essentially idle)")
        print()
        print("2. MULTI-GPU STRATEGIES:")
        print("   a) Model Parallelism: Split model components across GPUs")
        print("      - Put T3 model on GPU 0")
        print("      - Put S3Gen model on GPU 1")
        print("      - Requires modifying the ChatterboxTTS class")
        print()
        print("   b) Pipeline Parallelism: Process different stages on different GPUs")
        print("      - Text processing and T3 on GPU 0")
        print("      - S3Gen synthesis on GPU 1")
        print()
        print("   c) Request-level Parallelism: Run multiple API instances")
        print("      - Run one API server on GPU 0 (port 6093)")
        print("      - Run another on GPU 1 (port 6094)")
        print("      - Use a load balancer (nginx) to distribute requests")
        print()
        print("3. QUICK WINS:")
        print("   - Enable CUDA graphs for faster inference")
        print("   - Use torch.jit.script for model components")
        print("   - Enable cudnn.benchmark for optimal convolution algorithms")
        print("   - Use mixed precision (already enabled with autocast)")
        print()
        print("4. CONFIGURATION CHANGES:")
        print("   To use both GPUs, modify chatterbox-tts.service:")
        print("   - Remove: Environment=CUDA_VISIBLE_DEVICES=0")
        print("   - Or change to: Environment=CUDA_VISIBLE_DEVICES=0,1")
    else:
        print(f"You have {num_gpus} GPU(s). Multi-GPU optimization may not be applicable.")

def main():
    """Run all performance tests"""
    print("CHATTERBOX TTS MULTI-GPU PERFORMANCE ANALYSIS")
    print("=" * 80)
    print()
    
    # Check dependencies
    try:
        import GPUtil
    except ImportError:
        print("Installing GPUtil for better GPU monitoring...")
        os.system("pip install gputil")
        import GPUtil
    
    # Print system info
    print(f"CPU Count: {psutil.cpu_count()}")
    print(f"Total RAM: {psutil.virtual_memory().total / 1024**3:.2f} GB")
    print()
    
    # GPU information
    print_gpu_info()
    
    # Run tests
    test_single_gpu_load()
    test_multi_gpu_data_parallel()
    test_batch_processing()
    
    # Suggestions
    suggest_optimizations()

if __name__ == "__main__":
    main()