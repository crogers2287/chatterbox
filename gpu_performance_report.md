# Chatterbox TTS GPU Performance Analysis Report

## Current GPU Status

Based on the nvidia-smi output, here's the current state of your dual RTX 3090 GPUs:

### GPU 0 (Bus ID: 02:00.0)
- **Status**: Active with Chatterbox TTS
- **Memory Usage**: 9,126 MiB / 24,576 MiB (37.1%)
- **GPU Utilization**: 0% (idle at time of check)
- **Temperature**: 42°C
- **Power**: 15W / 350W (P8 state - power saving)
- **Processes**:
  - Xorg: 55 MiB
  - Python3 (PID 9376): 3,358 MiB
  - venv/python (PID 1677737) - **Chatterbox API**: 5,250 MiB
  - Python3 (PID 2485029): 446 MiB

### GPU 1 (Bus ID: 81:00.0)
- **Status**: Mostly idle
- **Memory Usage**: 64 MiB / 24,576 MiB (0.3%)
- **GPU Utilization**: 0%
- **Temperature**: 33°C
- **Power**: 31W / 350W (P8 state)
- **Processes**:
  - Xorg: 55 MiB only

## Key Findings

1. **Severe GPU Underutilization**:
   - GPU 1 is essentially idle with only 64 MiB used
   - Only GPU 0 is being used for Chatterbox TTS
   - Total GPU capacity utilization: ~18.5%

2. **Current Configuration Issues**:
   - The service file sets `CUDA_VISIBLE_DEVICES=0`, forcing single GPU usage
   - The API server hardcodes device to "cuda:0"
   - No multi-GPU support in the current implementation

3. **Memory Distribution**:
   - Chatterbox TTS model uses ~5.2 GB on GPU 0
   - Additional processes use ~3.8 GB on GPU 0
   - GPU 1 has 24 GB available but unused

## Performance Optimization Recommendations

### 1. Immediate Quick Wins (No Code Changes)

#### A. Run Dual API Servers
```bash
# Server 1 on GPU 0 (existing)
CUDA_VISIBLE_DEVICES=0 python api_server.py  # Port 6093

# Server 2 on GPU 1 (new)
CUDA_VISIBLE_DEVICES=1 python api_server.py  # Port 6094
```

**Benefits**: 
- 2x request throughput
- Full utilization of both GPUs
- No code modifications needed

#### B. Load Balancer Setup
Use nginx to distribute requests:
```nginx
upstream chatterbox {
    least_conn;
    server localhost:6093;
    server localhost:6094;
}
```

### 2. Code-Level Optimizations

#### A. Model Component Distribution
Modify the ChatterboxTTS to split models across GPUs:
- T3 model → GPU 0
- S3Gen model → GPU 1
- Voice Encoder → GPU 0

**Implementation**: Use the provided `multi_gpu_api_server.py`

#### B. Pipeline Parallelism
Process different stages on different GPUs:
1. Text processing & T3 inference on GPU 0
2. S3Gen synthesis on GPU 1
3. Post-processing on CPU

### 3. Service Configuration Updates

Update `/home/crogers2287/chatterbox/chatterbox-tts.service`:

```ini
# Remove or modify this line:
Environment=CUDA_VISIBLE_DEVICES=0,1  # Enable both GPUs

# Or run two separate services:
# chatterbox-tts-gpu0.service (CUDA_VISIBLE_DEVICES=0)
# chatterbox-tts-gpu1.service (CUDA_VISIBLE_DEVICES=1)
```

### 4. Performance Optimizations

#### A. Enable CUDA Optimizations
Already enabled in current code:
- ✅ cudnn.benchmark = True
- ✅ Automatic mixed precision (AMP)
- ✅ torch.cuda.synchronize() for timing

#### B. Additional Optimizations to Add:
```python
# Memory optimization
torch.cuda.empty_cache()
torch.backends.cudnn.deterministic = False

# Enable TensorFloat-32 for RTX 3090
torch.backends.cuda.matmul.allow_tf32 = True
torch.backends.cudnn.allow_tf32 = True
```

### 5. Monitoring and Testing

Use the provided scripts:
1. `test_multi_gpu_performance.py` - Benchmark different configurations
2. `monitor_gpu_performance.py` - Real-time GPU monitoring
3. `run_dual_gpu_servers.sh` - Start dual server setup

## Expected Performance Gains

With proper multi-GPU utilization:
- **Throughput**: 2x increase (linear scaling for request-level parallelism)
- **Latency**: Potential 20-30% reduction with pipeline parallelism
- **Memory**: Better distribution, reducing OOM risks
- **Reliability**: Redundancy with dual servers

## Implementation Priority

1. **Immediate**: Run dual API servers (1 hour setup)
2. **Short-term**: Update service configuration (30 minutes)
3. **Medium-term**: Implement model distribution (2-4 hours)
4. **Long-term**: Full pipeline parallelism (1-2 days)

## Conclusion

Your dual RTX 3090 setup has 49 GB total VRAM, but currently only uses ~9 GB (18.5%). By implementing the recommended optimizations, you can:
- Fully utilize both GPUs
- Double your request throughput
- Improve system reliability
- Prepare for scaling to more GPUs

The easiest win is running two API server instances, one on each GPU, with a load balancer distributing requests between them.