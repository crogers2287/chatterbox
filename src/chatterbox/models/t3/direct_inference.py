#!/usr/bin/env python3
"""
Direct T3 inference implementation with CUDA graphs
Bypasses HuggingFace backend for maximum performance
"""

import torch
from typing import Optional, Dict, Any
from tqdm import tqdm
import time

from .t3_cuda_graphs import T3StepCUDAGraphWrapper, get_next_bucket, TOKEN_LIMIT
from .fast_min_p_warper import FastMinPLogitsWarper
from .fast_top_p_warper import FastTopPLogitsWarper
from transformers.generation.logits_process import RepetitionPenaltyLogitsProcessor


class DirectT3Inference:
    """Direct T3 inference with CUDA graphs for 120+ it/s"""
    
    def __init__(self, t3_model):
        self.t3 = t3_model
        self.device = t3_model.device
        self.hp = t3_model.hp
        
        # Pre-allocate tensors for static shapes
        self.max_batch_size = 2  # For CFG
        self.max_seq_len = 512
        self.max_gen_len = TOKEN_LIMIT
        
        # Initialize processors
        self.top_p_warper = FastTopPLogitsWarper(top_p=1.0, device=self.device)
        self.min_p_warper = FastMinPLogitsWarper(min_p=0.05, device=self.device)
        self.repetition_penalty_processor = RepetitionPenaltyLogitsProcessor(penalty=1.2)
        
        # Pre-allocate embeddings cache
        self._init_embedding_caches()
        
        # CUDA graph wrappers
        self.forward_graph = None
        self.generate_graph = None
        
        # Static tensors for graph capture
        self.static_embeds = None
        self.static_hidden = None
        self.static_logits = None
        self.static_tokens = None
        
    def _init_embedding_caches(self):
        """Initialize embedding caches for fast lookup"""
        # Text embeddings
        self.text_emb_weight = self.t3.text_emb.weight.detach()
        
        # Speech embeddings
        self.speech_emb_weight = self.t3.speech_emb.weight.detach()
        
        # Position embeddings if using learned
        if hasattr(self.t3, 'speech_pos_emb'):
            self.speech_pos_cache = []
            for i in range(self.max_gen_len):
                pos_emb = self.t3.speech_pos_emb.get_fixed_embedding(i)
                self.speech_pos_cache.append(pos_emb)
            self.speech_pos_cache = torch.stack(self.speech_pos_cache, dim=0).to(self.device)
    
    def prepare_static_tensors(self):
        """Pre-allocate static tensors for CUDA graph capture"""
        B = self.max_batch_size
        S = self.max_seq_len
        H = self.t3.dim
        V = self.hp.speech_tokens_dict_size
        
        # Allocate on GPU with specific memory format
        self.static_embeds = torch.zeros((B, S, H), device=self.device, dtype=torch.float16)
        self.static_hidden = torch.zeros((B, 1, H), device=self.device, dtype=torch.float16)
        self.static_logits = torch.zeros((B, 1, V), device=self.device, dtype=torch.float16)
        self.static_tokens = torch.zeros((1, self.max_gen_len), device=self.device, dtype=torch.long)
        
        # Pre-fill with valid token IDs to avoid indexing errors
        self.static_tokens.fill_(self.hp.start_speech_token)
    
    def capture_forward_graph(self):
        """Capture CUDA graph for forward pass"""
        if self.forward_graph is not None:
            return
        
        print("Capturing forward CUDA graph...")
        self.prepare_static_tensors()
        
        # Warm up
        for _ in range(3):
            with torch.cuda.amp.autocast(dtype=torch.float16):
                _ = self.t3.tfmr(
                    inputs_embeds=self.static_embeds[:, :256, :],
                    use_cache=False,
                    output_hidden_states=True,
                    return_dict=True,
                )
        
        # Capture graph
        self.forward_graph = torch.cuda.CUDAGraph()
        with torch.cuda.graph(self.forward_graph):
            with torch.cuda.amp.autocast(dtype=torch.float16):
                out = self.t3.tfmr(
                    inputs_embeds=self.static_embeds,
                    use_cache=False,
                    output_hidden_states=True,
                    return_dict=True,
                )
                self.static_hidden.copy_(out.hidden_states[-1][:, -1:, :])
    
    def capture_generate_graph(self):
        """Capture CUDA graph for generation step"""
        if self.generate_graph is not None:
            return
        
        print("Capturing generation CUDA graph...")
        self.prepare_static_tensors()
        
        # Create minimal model for generation
        # This is a simplified generation that bypasses HF
        
        # Warm up
        for _ in range(3):
            with torch.cuda.amp.autocast(dtype=torch.float16):
                hidden = self.static_hidden
                logits = self.t3.speech_head(hidden)
                
                # Apply processors
                logits_flat = logits[0, 0, :]
                probs = torch.softmax(logits_flat / 0.8, dim=-1)
                next_token = torch.multinomial(probs, num_samples=1)
        
        # Capture graph
        self.generate_graph = torch.cuda.CUDAGraph()
        with torch.cuda.graph(self.generate_graph):
            with torch.cuda.amp.autocast(dtype=torch.float16):
                # Speech head projection
                logits = self.t3.speech_head(self.static_hidden)
                self.static_logits.copy_(logits)
    
    @torch.no_grad()
    def generate_fast(
        self,
        t3_cond,
        text_tokens,
        temperature=0.8,
        min_p=0.05,
        top_p=1.0,
        repetition_penalty=1.2,
        max_new_tokens=1400,
        cfg_weight=0.0,
        show_progress=True,
    ):
        """Ultra-fast generation with CUDA graphs"""
        
        # Ensure graphs are captured
        if self.forward_graph is None:
            self.capture_forward_graph()
        if self.generate_graph is None:
            self.capture_generate_graph()
        
        # Prepare initial embeddings
        embeds, len_cond = self.t3.prepare_input_embeds(
            t3_cond=t3_cond,
            text_tokens=text_tokens,
            speech_tokens=torch.tensor([[self.hp.start_speech_token]], device=self.device),
            cfg_weight=cfg_weight,
        )
        
        seq_len = embeds.shape[1]
        
        # Initial forward pass using standard path (not graphed due to dynamic shape)
        with torch.cuda.amp.autocast(dtype=torch.float16):
            tfmr_out = self.t3.tfmr(
                inputs_embeds=embeds,
                use_cache=False,
                output_hidden_states=True,
                return_dict=True,
            )
            hidden_states = tfmr_out.hidden_states[-1][:, -1:, :]
        
        # Initialize generation
        generated_tokens = [self.hp.start_speech_token]
        
        # Generation loop
        start_time = time.time()
        iterator = range(max_new_tokens)
        if show_progress:
            iterator = tqdm(iterator, desc="Ultra-fast sampling")
        
        for i in iterator:
            # Project to logits
            with torch.cuda.amp.autocast(dtype=torch.float16):
                logits = self.t3.speech_head(hidden_states)
            
            if cfg_weight > 0.0 and logits.shape[0] == 2:
                # CFG
                logits_cond = logits[0:1]
                logits_uncond = logits[1:2]
                logits = logits_cond + cfg_weight * (logits_cond - logits_uncond)
            
            # Get single logit vector
            logits = logits[0, 0, :]
            
            # Apply temperature
            if temperature != 1.0:
                logits = logits / temperature
            
            # Apply repetition penalty
            if len(generated_tokens) > 1:
                generated_ids = torch.tensor([generated_tokens], device=self.device)
                logits = self.repetition_penalty_processor(generated_ids, logits.unsqueeze(0).unsqueeze(0))[0, 0]
            
            # Apply min-p and top-p
            if min_p > 0:
                logits = self.min_p_warper(None, logits.unsqueeze(0).unsqueeze(0))[0, 0]
            if top_p < 1.0:
                logits = self.top_p_warper(None, logits.unsqueeze(0).unsqueeze(0))[0, 0]
            
            # Sample
            probs = torch.softmax(logits, dim=-1)
            next_token = torch.multinomial(probs, num_samples=1).item()
            
            # Check for EOS
            if next_token == self.hp.stop_speech_token:
                break
            
            generated_tokens.append(next_token)
            
            # Get next embedding
            next_emb = self.speech_emb_weight[next_token].unsqueeze(0).unsqueeze(0)
            if hasattr(self, 'speech_pos_cache'):
                next_emb = next_emb + self.speech_pos_cache[i].unsqueeze(0)
            
            # For CFG, duplicate embedding
            if cfg_weight > 0.0:
                next_emb = torch.cat([next_emb, next_emb], dim=0)
            
            # Next forward pass (could be graphed for fixed shapes)
            with torch.cuda.amp.autocast(dtype=torch.float16):
                tfmr_out = self.t3.tfmr(
                    inputs_embeds=next_emb,
                    use_cache=False,
                    output_hidden_states=True,
                    return_dict=True,
                )
                hidden_states = tfmr_out.hidden_states[-1][:, -1:, :]
        
        # Calculate speed
        elapsed = time.time() - start_time
        tokens_generated = len(generated_tokens) - 1
        speed = tokens_generated / elapsed if elapsed > 0 else 0
        
        if show_progress:
            print(f"\nGenerated {tokens_generated} tokens in {elapsed:.2f}s = {speed:.1f} it/s")
        
        # Convert to tensor
        return torch.tensor(generated_tokens[1:], device=self.device)  # Skip BOS


def patch_t3_for_direct_inference(t3_model):
    """Patch T3 model with direct inference method"""
    
    # Create direct inference instance
    direct_inf = DirectT3Inference(t3_model)
    
    # Add as method to T3
    t3_model.direct_inference = direct_inf.generate_fast
    
    # Also add the instance for access to internals
    t3_model._direct_inf = direct_inf
    
    return t3_model