#!/usr/bin/env python3
"""Optimized inference implementation for T3 model"""

import torch
import time
from typing import Optional
from torch import Tensor
from tqdm import tqdm
from transformers.cache_utils import StaticCache

from .t3_cuda_graphs import get_next_bucket, TOKEN_LIMIT


def _ensure_BOT_EOT(text_tokens, hp):
    """Ensure BOT and EOT tokens are present"""
    B = text_tokens.size(0)
    # Ensure BOT at start
    if (text_tokens[:, 0] != hp.start_text_token).any():
        text_tokens = torch.cat([hp.start_text_token * torch.ones(B, 1, dtype=text_tokens.dtype, device=text_tokens.device), text_tokens], dim=1)
    # Ensure EOT at end  
    if (text_tokens[:, -1] != hp.stop_text_token).any():
        text_tokens = torch.cat([text_tokens, hp.stop_text_token * torch.ones(B, 1, dtype=text_tokens.dtype, device=text_tokens.device)], dim=1)
    return text_tokens


def _initial_forward_pass(
    inputs_embeds: Tensor,
    kv_cache: StaticCache,
    patched_model,
    seq_len: int = 1,
):
    """Initial forward pass to populate KV cache"""
    # Trim padded inputs_embeds to actual sequence length
    inputs_embeds = inputs_embeds[:, :seq_len, :]
    # Initial forward pass
    output_logits = patched_model(
        inputs_embeds=inputs_embeds,
        past_key_values=kv_cache,
    )
    output_logits = output_logits[:, -1:, :]  # Normalize shape
    return output_logits


# Compiled variants of initial forward pass
_initial_forward_pass_variants = {
    "eager": _initial_forward_pass,
    "cudagraphs": torch.compile(_initial_forward_pass, backend="cudagraphs", fullgraph=True),
}


def generate_t3_token(
    _speech_embedding_cache: Tensor,
    output_logits: Tensor,
    i_tensor: Tensor,
    batch_idx: Tensor,
    _speech_pos_embedding_cache: Tensor,
    generated_ids: Tensor,
    cfg_weight: Tensor,
    temperature: Tensor,
    repetition_penalty_processor,
    min_p_warper,
    top_p_warper,
    patched_model,
    kv_cache,
    stride_length: int = 1,
    max_position: Optional[int] = None,
):
    """Generate a single token"""
    # Get logits
    logits = output_logits[0, 0, :]
    logits_cond = logits
    
    # Apply CFG if weight > 0
    if cfg_weight > 0.0:
        logits_uncond = output_logits[1, 0, :]
        logits = logits_cond + cfg_weight * (logits_cond - logits_uncond)
    
    # Apply repetition penalty
    if repetition_penalty_processor is not None:
        logits = repetition_penalty_processor(
            generated_ids.unsqueeze(0), logits.unsqueeze(0).unsqueeze(0)
        )[0, 0]
    
    # Apply temperature
    if temperature != 1.0:
        logits = logits / temperature
    
    # Apply min-p and top-p filtering
    if min_p_warper is not None:
        logits = min_p_warper(generated_ids.unsqueeze(0), logits.unsqueeze(0).unsqueeze(0))[0, 0]
    if top_p_warper is not None:
        logits = top_p_warper(generated_ids.unsqueeze(0), logits.unsqueeze(0).unsqueeze(0))[0, 0]
    
    # Sample token
    probs = torch.softmax(logits, dim=-1)
    next_token = torch.multinomial(probs, num_samples=1)
    
    # Update generated_ids
    generated_ids[batch_idx, i_tensor] = next_token
    
    # Get next token embedding
    if cfg_weight > 0.0:
        next_emb = _speech_embedding_cache[next_token]
        next_emb_cond = next_emb + _speech_pos_embedding_cache[i_tensor]
        inputs_embeds = torch.cat([next_emb_cond, next_emb_cond])
    else:
        next_emb = _speech_embedding_cache[next_token]
        inputs_embeds = next_emb + _speech_pos_embedding_cache[i_tensor]
    
    # Forward pass for next token
    output_logits = patched_model(
        inputs_embeds=inputs_embeds,
        past_key_values=kv_cache,
    )
    
    return next_token, output_logits, generated_ids


# Compiled variants  
_generate_token_variants = {
    "eager": generate_t3_token,
    "cudagraphs": torch.compile(generate_t3_token, backend="cudagraphs", fullgraph=True),
    "inductor": torch.compile(generate_t3_token, backend="inductor", fullgraph=True, mode="max-autotune"),
}


def add_optimized_inference_to_t3():
    """Monkey-patch the optimized inference method to T3 class"""
    
    def inference_optimized(
        self,
        *,
        t3_cond,
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
        """Optimized inference with CUDA graphs and static cache"""
        
        # Ensure we have the patched model
        self.init_patched_model()
        
        # Validate inputs
        assert prepend_prompt_speech_tokens is None, "not implemented"
        text_tokens = _ensure_BOT_EOT(text_tokens, self.hp)
        text_tokens = torch.atleast_2d(text_tokens).to(dtype=torch.long, device=self.device)
        
        if initial_speech_tokens is None:
            initial_speech_tokens = self.hp.start_speech_token * torch.ones_like(text_tokens[:, :1])
        
        # Prepare embeddings
        embeds, len_cond = self.prepare_input_embeds(
            t3_cond=t3_cond,
            text_tokens=text_tokens,
            speech_tokens=initial_speech_tokens,
            cfg_weight=cfg_weight,
        )
        
        # Pre-compute caches
        self.get_speech_pos_embedding_cache(TOKEN_LIMIT + 1, dtype=self.patched_model.dtype)
        self.init_speech_embedding_cache(vocab_size=self.hp.speech_tokens_dict_size, dtype=self.patched_model.dtype)
        
        device = embeds.device
        
        bos_token = torch.tensor([[self.hp.start_speech_token]], dtype=torch.long, device=device)
        bos_embed = self._speech_embedding_cache[bos_token]
        bos_embed = bos_embed + self._speech_pos_embedding_cache[0]
        
        # Double for CFG
        bos_embed = torch.cat([bos_embed, bos_embed])
        
        if cfg_weight > 0:
            inputs_embeds = torch.cat([embeds, bos_embed], dim=1)
        else:
            inputs_embeds = embeds
        
        # Track generated tokens
        PAD_TOKEN_ID = self.hp.stop_speech_token + 1
        bos_len = bos_token.shape[1]
        
        # Update processors
        self.update_processors(top_p, min_p, repetition_penalty, skip_when_1=skip_when_1)
        
        # Convert to model dtype
        inputs_embeds = inputs_embeds.to(self.patched_model.dtype)
        embeds = embeds.to(self.patched_model.dtype)
        bos_embed = bos_embed.to(self.patched_model.dtype)
        
        stop_token_tensor = torch.tensor(self.hp.stop_speech_token, device=self.device)
        
        # Set up cache
        effective_batch_size = 2 if cfg_weight > 0.0 else 1
        _, seq_len = inputs_embeds.shape[:2]
        
        if max_new_tokens is None:
            max_new_tokens = self.hp.max_speech_tokens
        
        if max_cache_len < seq_len + max_new_tokens:
            print(f"Warning: Adjusting max_new_tokens from {max_new_tokens} to {max_cache_len - seq_len}")
            max_new_tokens = max_cache_len - seq_len
        
        assert max_new_tokens < TOKEN_LIMIT, f"max_new_tokens {max_new_tokens} too large"
        
        generated_ids = torch.full((1, bos_len + TOKEN_LIMIT), PAD_TOKEN_ID, dtype=torch.long, device=device)
        generated_ids[0, :bos_len] = bos_token
        
        # Get static cache
        config = self.patched_model.config
        if not hasattr(self, 'kv_cache') or self.kv_cache is None:
            self.kv_cache = StaticCache(
                config=config,
                batch_size=effective_batch_size,
                max_cache_len=max_cache_len,
                device=device,
                dtype=self.patched_model.dtype,
            )
        else:
            self.kv_cache.reset()
        
        kv_cache = self.kv_cache
        
        # Pad inputs for static shape
        max_seq_len = 1024
        if inputs_embeds.shape[1] < max_seq_len:
            pad_len = max_seq_len - inputs_embeds.shape[1]
            inputs_embeds = torch.nn.functional.pad(inputs_embeds, (0, 0, 0, pad_len))
        
        # Initial forward pass
        initial_forward = _initial_forward_pass_variants.get(
            initial_forward_pass_backend,
            _initial_forward_pass_variants["eager"]
        )
        output_logits = initial_forward(inputs_embeds, kv_cache, self.patched_model, seq_len=seq_len)
        
        # Setup CUDA graph wrapper
        if not hasattr(self, "cudagraph_wrapper"):
            from .t3_cuda_graphs import T3StepCUDAGraphWrapper
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
        
        # Generation loop
        for i in tqdm(range(max_new_tokens // stride_length), desc="Sampling", dynamic_ncols=True):
            i_tensor = indices[i * stride_length]
            
            # Check for EOS
            if i * stride_length > length_guesstimate and i % (20 // stride_length) == 0:
                if (generated_ids == stop_token_tensor).any():
                    if benchmark_t3:
                        torch.cuda.synchronize()
                        elapsed = time.time() - start
                        tokens = (i + 1) * stride_length
                        print(f"Generated {tokens} tokens in {elapsed:.2f}s ({tokens/elapsed:.2f} it/s)")
                    break
            
            # Mark CUDA graph step
            if hasattr(torch.compiler, 'cudagraph_mark_step_begin'):
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
        
        # Find actual length
        stop_positions = (generated_ids == stop_token_tensor).nonzero(as_tuple=True)[1]
        if len(stop_positions) > 0:
            actual_length = stop_positions[0].item() + 1
        else:
            actual_length = bos_len + max_new_tokens
        
        return generated_ids[0, :actual_length]
    
    # Import and patch
    from chatterbox.models.t3.t3 import T3
    T3.inference_optimized = inference_optimized
    
    return inference_optimized
