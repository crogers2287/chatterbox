#!/usr/bin/env python3
"""
Optimized batch processor for audiobook generation using dual GPU setup
"""
import asyncio
import aiohttp
import json
import time
from pathlib import Path
from typing import List, Dict, Tuple
import argparse
from concurrent.futures import ThreadPoolExecutor
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AudiobookBatchProcessor:
    def __init__(self, api_url='http://localhost:6095', max_concurrent=4):
        self.api_url = api_url
        self.max_concurrent = max_concurrent
        self.session = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.session.close()
        
    async def synthesize_chunk(self, chunk_id: int, text: str, voice_params: Dict) -> Tuple[int, str, float]:
        """Synthesize a single chunk of text"""
        start_time = time.time()
        
        # Prepare the request
        data = aiohttp.FormData()
        data.add_field('text', text)
        
        # Add voice parameters
        for key, value in voice_params.items():
            if key != 'audio_prompt_path':
                data.add_field(key, str(value))
                
        # Add voice file if specified
        if 'audio_prompt_path' in voice_params and voice_params['audio_prompt_path']:
            with open(voice_params['audio_prompt_path'], 'rb') as f:
                data.add_field('audio_prompt', f.read(), 
                             filename=Path(voice_params['audio_prompt_path']).name,
                             content_type='audio/wav')
        
        try:
            async with self.session.post(f"{self.api_url}/synthesize", data=data) as resp:
                result = await resp.json()
                
                if result.get('success'):
                    # Download the audio file
                    audio_url = f"{self.api_url}{result['audio_url']}"
                    async with self.session.get(audio_url) as audio_resp:
                        audio_data = await audio_resp.read()
                        
                    elapsed = time.time() - start_time
                    logger.info(f"Chunk {chunk_id} completed in {elapsed:.2f}s")
                    return chunk_id, audio_data, elapsed
                else:
                    raise Exception(f"Synthesis failed: {result.get('message', 'Unknown error')}")
                    
        except Exception as e:
            logger.error(f"Error processing chunk {chunk_id}: {e}")
            raise
            
    async def process_batch(self, chunks: List[Tuple[int, str]], voice_params: Dict) -> Dict[int, bytes]:
        """Process multiple chunks concurrently"""
        semaphore = asyncio.Semaphore(self.max_concurrent)
        
        async def process_with_semaphore(chunk_id: int, text: str):
            async with semaphore:
                return await self.synthesize_chunk(chunk_id, text, voice_params)
        
        # Create tasks for all chunks
        tasks = [process_with_semaphore(chunk_id, text) for chunk_id, text in chunks]
        
        # Process all chunks
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Organize results
        audio_data = {}
        total_time = 0
        errors = []
        
        for result in results:
            if isinstance(result, Exception):
                errors.append(result)
            else:
                chunk_id, data, elapsed = result
                audio_data[chunk_id] = data
                total_time = max(total_time, elapsed)
                
        if errors:
            logger.warning(f"Encountered {len(errors)} errors during processing")
            
        return audio_data, total_time
        
    async def process_audiobook(self, input_file: str, output_dir: str, voice_params: Dict):
        """Process an entire audiobook file"""
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)
        
        # Read input file
        with open(input_file, 'r') as f:
            content = f.read()
            
        # Split into chunks (by double newline for paragraphs)
        chunks = [chunk.strip() for chunk in content.split('\n\n') if chunk.strip()]
        logger.info(f"Processing {len(chunks)} chunks from {input_file}")
        
        # Prepare chunk list with IDs
        indexed_chunks = [(i, chunk) for i, chunk in enumerate(chunks)]
        
        # Process in batches
        batch_size = self.max_concurrent * 2  # Process more than concurrent limit
        all_audio = {}
        total_start = time.time()
        
        for i in range(0, len(indexed_chunks), batch_size):
            batch = indexed_chunks[i:i + batch_size]
            logger.info(f"Processing batch {i//batch_size + 1}/{(len(indexed_chunks) + batch_size - 1)//batch_size}")
            
            audio_data, batch_time = await self.process_batch(batch, voice_params)
            all_audio.update(audio_data)
            
        total_time = time.time() - total_start
        
        # Save individual audio files
        for chunk_id, audio_data in all_audio.items():
            output_file = output_path / f"chunk_{chunk_id:04d}.wav"
            with open(output_file, 'wb') as f:
                f.write(audio_data)
                
        logger.info(f"Completed {len(all_audio)} chunks in {total_time:.2f}s")
        logger.info(f"Average time per chunk: {total_time/len(chunks):.2f}s")
        
        # Create manifest
        manifest = {
            'source_file': input_file,
            'total_chunks': len(chunks),
            'processed_chunks': len(all_audio),
            'total_time': total_time,
            'voice_params': voice_params,
            'chunks': [{'id': i, 'text': chunks[i][:100] + '...'} for i in range(len(chunks))]
        }
        
        with open(output_path / 'manifest.json', 'w') as f:
            json.dump(manifest, f, indent=2)
            
        return len(all_audio), total_time


async def main():
    parser = argparse.ArgumentParser(description='Batch process audiobook with Chatterbox TTS')
    parser.add_argument('input_file', help='Input text file')
    parser.add_argument('output_dir', help='Output directory for audio files')
    parser.add_argument('--voice-file', help='Voice reference audio file')
    parser.add_argument('--api-url', default='http://localhost:6095', help='API URL (default: dual GPU load balancer)')
    parser.add_argument('--concurrent', type=int, default=4, help='Max concurrent requests')
    parser.add_argument('--exaggeration', type=float, default=0.7)
    parser.add_argument('--temperature', type=float, default=0.9)
    parser.add_argument('--cfg-weight', type=float, default=0.6)
    parser.add_argument('--seed', type=int, default=None)
    
    args = parser.parse_args()
    
    # Prepare voice parameters
    voice_params = {
        'exaggeration': args.exaggeration,
        'temperature': args.temperature,
        'cfg_weight': args.cfg_weight,
        'min_p': 0.05,
        'top_p': 1.0,
        'repetition_penalty': 1.1,
        'speech_rate': 1.0,
    }
    
    if args.seed:
        voice_params['seed'] = args.seed
        
    if args.voice_file:
        voice_params['audio_prompt_path'] = args.voice_file
        
    # Process audiobook
    async with AudiobookBatchProcessor(args.api_url, args.concurrent) as processor:
        chunks_processed, total_time = await processor.process_audiobook(
            args.input_file,
            args.output_dir,
            voice_params
        )
        
        print(f"\nProcessing complete!")
        print(f"Chunks processed: {chunks_processed}")
        print(f"Total time: {total_time:.2f}s")
        print(f"Average per chunk: {total_time/chunks_processed:.2f}s")


if __name__ == "__main__":
    asyncio.run(main())