import random
import numpy as np
import torch
import gradio as gr
from chatterbox.tts import ChatterboxTTS


# Force CUDA if available, with explicit GPU selection
if torch.cuda.is_available():
    DEVICE = "cuda:0"  # Use first GPU explicitly
    torch.cuda.set_device(0)  # Set primary GPU
    # Enable optimizations for GPU
    torch.backends.cudnn.benchmark = True
    torch.backends.cudnn.enabled = True
    # Clear any cached memory
    torch.cuda.empty_cache()
    print(f"Using GPU: {torch.cuda.get_device_name(0)}")
    print(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
else:
    DEVICE = "cpu"
    print("CUDA not available, using CPU")


def set_seed(seed: int):
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
    random.seed(seed)
    np.random.seed(seed)


def load_model():
    if torch.cuda.is_available():
        # Clear GPU cache before loading
        torch.cuda.empty_cache()
        print(f"Loading model on {DEVICE}")
    
    model = ChatterboxTTS.from_pretrained(DEVICE)
    
    if torch.cuda.is_available():
        # Ensure all model components are on GPU
        model.t3 = model.t3.to(DEVICE)
        model.s3gen = model.s3gen.to(DEVICE)
        model.ve = model.ve.to(DEVICE)
        if model.conds is not None:
            model.conds = model.conds.to(DEVICE)
        
        # Print GPU memory usage after loading
        allocated = torch.cuda.memory_allocated() / 1024**3
        cached = torch.cuda.memory_reserved() / 1024**3
        print(f"GPU Memory - Allocated: {allocated:.2f} GB, Cached: {cached:.2f} GB")
    
    return model


def generate(model, text, audio_prompt_path, exaggeration, temperature, seed_num, cfgw, min_p, top_p, repetition_penalty):
    if model is None:
        model = ChatterboxTTS.from_pretrained(DEVICE)
        if torch.cuda.is_available():
            # Ensure model is on GPU
            model.t3 = model.t3.to(DEVICE)
            model.s3gen = model.s3gen.to(DEVICE)
            model.ve = model.ve.to(DEVICE)
            if model.conds is not None:
                model.conds = model.conds.to(DEVICE)

    if seed_num != 0:
        set_seed(int(seed_num))

    # Ensure CUDA synchronization for accurate timing if needed
    if torch.cuda.is_available():
        torch.cuda.synchronize()

    with torch.cuda.amp.autocast(enabled=torch.cuda.is_available()):
        wav = model.generate(
            text,
            audio_prompt_path=audio_prompt_path,
            exaggeration=exaggeration,
            temperature=temperature,
            cfg_weight=cfgw,
            min_p=min_p,
            top_p=top_p,
            repetition_penalty=repetition_penalty,
        )
    
    # Ensure output is moved to CPU for return
    if torch.cuda.is_available():
        torch.cuda.synchronize()  # Wait for GPU operations to complete
        wav_cpu = wav.cpu()  # Move to CPU
    else:
        wav_cpu = wav
    
    return (model.sr, wav_cpu.squeeze(0).numpy())


with gr.Blocks() as demo:
    model_state = gr.State(None)  # Loaded once per session/user
    
    # Add GPU info display
    if torch.cuda.is_available():
        gpu_info = f"🚀 GPU Acceleration Enabled: {torch.cuda.get_device_name(0)} | Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB"
    else:
        gpu_info = "⚠️ Running on CPU - GPU not available"
    
    gr.Markdown(f"### Chatterbox TTS\n{gpu_info}")

    with gr.Row():
        with gr.Column():
            text = gr.Textbox(
                value="Now let's make my mum's favourite. So three mars bars into the pan. Then we add the tuna and just stir for a bit, just let the chocolate and fish infuse. A sprinkle of olive oil and some tomato ketchup. Now smell that. Oh boy this is going to be incredible.",
                label="Text to synthesize (max chars 300)",
                max_lines=5
            )
            ref_wav = gr.Audio(sources=["upload", "microphone"], type="filepath", label="Reference Audio File", value=None)
            exaggeration = gr.Slider(0.25, 2, step=.05, label="Exaggeration (Neutral = 0.5, extreme values can be unstable)", value=.5)
            cfg_weight = gr.Slider(0.0, 1, step=.05, label="CFG/Pace", value=0.5)

            with gr.Accordion("More options", open=False):
                seed_num = gr.Number(value=0, label="Random seed (0 for random)")
                temp = gr.Slider(0.05, 5, step=.05, label="temperature", value=.8)
                min_p = gr.Slider(0.00, 1.00, step=0.01, label="min_p || Newer Sampler. Recommend 0.02 > 0.1. Handles Higher Temperatures better. 0.00 Disables", value=0.05)
                top_p = gr.Slider(0.00, 1.00, step=0.01, label="top_p || Original Sampler. 1.0 Disables(recommended). Original 0.8", value=1.00)
                repetition_penalty = gr.Slider(1.00, 2.00, step=0.1, label="repetition_penalty", value=1.2)

            run_btn = gr.Button("Generate", variant="primary")

        with gr.Column():
            audio_output = gr.Audio(label="Output Audio")

    demo.load(fn=load_model, inputs=[], outputs=model_state)

    run_btn.click(
        fn=generate,
        inputs=[
            model_state,
            text,
            ref_wav,
            exaggeration,
            temp,
            seed_num,
            cfg_weight,
            min_p,
            top_p,
            repetition_penalty,
        ],
        outputs=audio_output,
    )

if __name__ == "__main__":
    demo.queue(
        max_size=50,
        default_concurrency_limit=1,
    ).launch(server_name="0.0.0.0", server_port=6093, share=False)
