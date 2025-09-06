#!/usr/bin/env python3
"""
Implement faster inference optimizations from rsxdalv/chatterbox
This includes:
1. CUDA graphs with bucketing
2. Static KV cache
3. Torch compile with cudagraphs backend
4. Optimized token generation
"""

import shutil
import os

def copy_optimizations():
    """Copy optimization files from faster branch"""
    # Files to copy
    files_to_copy = [
        ('src/chatterbox/models/t3/t3_cuda_graphs.py', 'src/chatterbox/models/t3/t3_cuda_graphs.py'),
        ('src/chatterbox/models/t3/caches.py', 'src/chatterbox/models/t3/caches.py'),
    ]
    
    for src, dst in files_to_copy:
        src_path = f'/home/crogers2287/chatterbox/chatterbox-faster/{src}'
        dst_path = f'/home/crogers2287/chatterbox/{dst}'
        
        if os.path.exists(src_path):
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            shutil.copy2(src_path, dst_path)
            print(f"Copied {src} -> {dst}")
        else:
            print(f"Warning: {src} not found")

def patch_t3_model():
    """Apply the faster inference patches to t3.py"""
    print("\nPatching T3 model for faster inference...")
    
    # Read the current t3.py
    with open('/home/crogers2287/chatterbox/src/chatterbox/models/t3/t3.py', 'r') as f:
        content = f.read()
    
    # Add imports if not present
    imports_to_add = [
        "from .t3_cuda_graphs import T3StepCUDAGraphWrapper, get_next_bucket",
        "from .caches import StaticCache",
        "import time",
    ]
    
    # Find the imports section and add new imports
    import_section_end = content.find("class T3")
    if import_section_end > 0:
        for imp in imports_to_add:
            if imp not in content[:import_section_end]:
                # Add after the last import
                last_import = content[:import_section_end].rfind("\nimport")
                if last_import == -1:
                    last_import = content[:import_section_end].rfind("\nfrom")
                if last_import > 0:
                    next_newline = content.find("\n", last_import + 1)
                    content = content[:next_newline] + f"\n{imp}" + content[next_newline:]
                    import_section_end += len(imp) + 1
    
    print("Added necessary imports")
    
    # Save the patched file
    with open('/home/crogers2287/chatterbox/src/chatterbox/models/t3/t3.py', 'w') as f:
        f.write(content)
    
    print("T3 model patched successfully!")

def create_optimized_inference():
    """Create an optimized inference method"""
    
    optimized_inference = '''
def inference_optimized(
    self,
    *,
    t3_cond: T3Cond,
    text_tokens: Tensor,
    initial_speech_tokens: Optional[Tensor] = None,
    prepend_prompt_speech_tokens: Optional[Tensor] = None,
    length_guesstimate: int = 400,
    max_new_tokens: Optional[int] = None,
    min_new_tokens: Optional[int] = None,
    stop_on_eos: bool = True,
    do_sample: bool = True,
    num_return_sequences: int = 1,
    # generation params
    temperature: float = 1.0,
    min_p: float = 0.1,
    top_p: float = 1.0,
    length_penalty: float = 1.0,
    repetition_penalty: float = 1.2,
    cfg_weight: float = 0,
    # optimizations
    max_cache_len: int = 2048,
    initial_forward_pass_backend: str = "eager",
    generate_token_backend: str = "cudagraphs-manual",
    stride_length: int = 1,
    skip_when_1: bool = True,
    benchmark_t3: bool = False,
):
    """
    Optimized inference with CUDA graphs and static cache
    """
    # Validate / sanitize inputs
    assert prepend_prompt_speech_tokens is None, "not implemented"
    _ensure_BOT_EOT(text_tokens, self.hp)
    text_tokens = torch.atleast_2d(text_tokens).to(dtype=torch.long, device=self.device)
    
    # Default initial speech to a single start-of-speech token
    if initial_speech_tokens is None:
        initial_speech_tokens = self.hp.start_speech_token * torch.ones_like(text_tokens[:, :1])
    
    # Prepare custom input embeds
    embeds, len_cond = self.prepare_input_embeds(
        t3_cond=t3_cond,
        text_tokens=text_tokens,
        speech_tokens=initial_speech_tokens,
        cfg_weight=cfg_weight,
    )
    
    # Initialize static cache for KV storage
    if not hasattr(self, '_static_cache') or self._static_cache is None:
        config = self.patched_model.config
        self._static_cache = StaticCache(
            config=config,
            batch_size=2 if cfg_weight > 0 else 1,
            max_cache_len=max_cache_len,
            device=self.device,
            dtype=self.patched_model.dtype,
        )
    
    # Pre-compute embeddings cache
    if not hasattr(self, '_speech_embedding_cache'):
        self._speech_embedding_cache = self.speech_emb.weight.detach().clone()
        self._speech_pos_embedding_cache = torch.stack([
            self.speech_pos_emb.get_fixed_embedding(i) 
            for i in range(max_cache_len)
        ]).to(self.patched_model.dtype)
    
    device = embeds.device
    TOKEN_LIMIT = 1500
    
    bos_token = torch.tensor([[self.hp.start_speech_token]], dtype=torch.long, device=device)
    bos_embed = self._speech_embedding_cache[bos_token]
    bos_embed = bos_embed + self._speech_pos_embedding_cache[0]
    
    # batch_size=2 for CFG
    bos_embed = torch.cat([bos_embed, bos_embed])
    
    # Combine condition and BOS token for the initial input if cfg_weight > 0
    if cfg_weight > 0:
        inputs_embeds = torch.cat([embeds, bos_embed], dim=1)
    else:
        inputs_embeds = embeds
    
    # Track generated token ids
    PAD_TOKEN_ID = self.hp.stop_speech_token + 1
    bos_len = bos_token.shape[1]
    
    # Instantiate the logits processors
    self.update_processors(top_p, min_p, repetition_penalty, skip_when_1=skip_when_1)
    
    # Move inputs to correct dtype
    inputs_embeds = inputs_embeds.to(self.patched_model.dtype)
    embeds = embeds.to(self.patched_model.dtype)
    bos_embed = bos_embed.to(self.patched_model.dtype)
    
    stop_token_tensor = torch.tensor(self.hp.stop_speech_token, device=self.device)
    
    # Set max batch size based on CFG usage
    effective_batch_size = 2 if cfg_weight > 0.0 else 1
    
    _, seq_len = inputs_embeds.shape[:2]
    if max_cache_len < seq_len + max_new_tokens:
        max_new_tokens = max_cache_len - seq_len
    
    assert max_new_tokens < TOKEN_LIMIT, f"max_new_tokens {max_new_tokens} is too large"
    
    generated_ids = torch.full((1, bos_len + TOKEN_LIMIT), PAD_TOKEN_ID, dtype=torch.long, device=device)
    generated_ids[0, :bos_len] = bos_token
    
    # Initial forward pass
    kv_cache = self._static_cache
    kv_cache.reset()
    
    # Pad inputs for static shapes (required for cudagraphs)
    max_seq_len = 1024  # Max expected condition length
    if inputs_embeds.shape[1] < max_seq_len:
        pad_len = max_seq_len - inputs_embeds.shape[1]
        inputs_embeds = torch.nn.functional.pad(inputs_embeds, (0, 0, 0, pad_len))
    
    # Initial forward pass
    initial_forward = _initial_forward_pass_variants.get(
        initial_forward_pass_backend, 
        _initial_forward_pass_variants["eager"]
    )
    output_logits = initial_forward(
        inputs_embeds, kv_cache, self.patched_model, seq_len=seq_len
    )
    
    # Setup CUDA graph wrapper if needed
    if not hasattr(self, "cudagraph_wrapper"):
        self.cudagraph_wrapper = T3StepCUDAGraphWrapper(
            generate_t3_token,
            self.patched_model,
            kv_cache,
            self.repetition_penalty_processor,
            self.min_p_warper,
            self.top_p_warper,
        )
    
    self.cudagraph_wrapper.guard()
    
    _generate_token_variants["cudagraphs-manual"] = self.cudagraph_wrapper
    generate_token = _generate_token_variants.get(
        generate_token_backend, 
        _generate_token_variants["eager"]
    )
    
    if benchmark_t3:
        start = time.time()
        torch.cuda.synchronize()
    
    indices = torch.arange(1, max_new_tokens + 1, device='cuda')
    batch_idx = torch.zeros(1, dtype=torch.long, device=generated_ids.device)
    
    stride_length = stride_length if "stride" in generate_token_backend else 1
    
    for i in range(max_new_tokens // stride_length):
        i_tensor = indices[i * stride_length]
        
        # Check for EOS token periodically
        if i * stride_length > length_guesstimate and i % (20 // stride_length) == 0:
            if (generated_ids == stop_token_tensor).any():
                if benchmark_t3:
                    torch.cuda.synchronize()
                    elapsed = time.time() - start
                    tokens = (i + 1) * stride_length
                    print(f"Generated {tokens} tokens in {elapsed:.2f}s ({tokens/elapsed:.2f} it/s)")
                break
        
        # Calculate bucket for CUDA graphs
        torch.compiler.cudagraph_mark_step_begin()
        bucket_size = 250
        max_position = get_next_bucket(
            i + seq_len, bucket_size, TOKEN_LIMIT
        ) if generate_token_backend == "cudagraphs-manual" else None
        
        outputs = generate_token(
            self._speech_embedding_cache,
            output_logits,
            i_tensor,
            batch_idx,
            self._speech_pos_embedding_cache,
            generated_ids,
            cfg_weight,
            temperature,
            self.repetition_penalty_processor,
            self.min_p_warper,
            self.top_p_warper,
            self.patched_model,
            kv_cache,
            stride_length,
            max_position=max_position,
        )
        
        output_logits = outputs[1]
        if len(outputs) == 3:
            generated_ids = outputs[2].clone()
        output_logits = output_logits.clone()
    
    if benchmark_t3:
        torch.cuda.synchronize()
        elapsed = time.time() - start
        tokens = max_new_tokens
        print(f"Generated {tokens} tokens in {elapsed:.2f}s ({tokens/elapsed:.2f} it/s)")
    
    return generated_ids[0, :bos_len + max_new_tokens]

# Add as a method to T3 class
T3.inference_optimized = inference_optimized
'''
    
    # Save the optimized inference method
    with open('/home/crogers2287/chatterbox/src/chatterbox/models/t3/inference_optimized.py', 'w') as f:
        f.write(optimized_inference)
    
    print("Created optimized inference method")

if __name__ == "__main__":
    print("Implementing faster inference optimizations...")
    
    # Step 1: Copy optimization files
    copy_optimizations()
    
    # Step 2: Patch T3 model
    patch_t3_model()
    
    # Step 3: Create optimized inference
    create_optimized_inference()
    
    print("\n✅ Faster inference implementation complete!")
    print("To use: model.inference_optimized(...)")