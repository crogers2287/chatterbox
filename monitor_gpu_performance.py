#!/usr/bin/env python3
"""
Real-time GPU performance monitoring for Chatterbox TTS
"""

import time
import os
import sys
import subprocess
from datetime import datetime
import psutil
import GPUtil
from rich.console import Console
from rich.table import Table
from rich.live import Live
from rich.panel import Panel
from rich.layout import Layout
from rich.progress import Progress, SpinnerColumn, TextColumn

def get_gpu_stats():
    """Get detailed GPU statistics"""
    gpus = GPUtil.getGPUs()
    stats = []
    
    for gpu in gpus:
        stats.append({
            'id': gpu.id,
            'name': gpu.name,
            'load': gpu.load * 100,
            'memory_used': gpu.memoryUsed,
            'memory_total': gpu.memoryTotal,
            'memory_util': gpu.memoryUtil * 100,
            'temperature': gpu.temperature,
            'power_draw': gpu.powerDraw if hasattr(gpu, 'powerDraw') else 0,
            'power_limit': gpu.powerLimit if hasattr(gpu, 'powerLimit') else 0
        })
    
    return stats

def get_process_gpu_usage():
    """Get GPU memory usage by process"""
    try:
        # Run nvidia-smi to get process information
        result = subprocess.run([
            'nvidia-smi', '--query-compute-apps=pid,name,gpu_uuid,used_memory',
            '--format=csv,noheader,nounits'
        ], capture_output=True, text=True)
        
        processes = []
        for line in result.stdout.strip().split('\n'):
            if line:
                parts = line.split(', ')
                if len(parts) >= 4:
                    pid = int(parts[0])
                    name = parts[1]
                    gpu_uuid = parts[2]
                    memory_mb = int(parts[3])
                    
                    # Get process info
                    try:
                        proc = psutil.Process(pid)
                        cmdline = ' '.join(proc.cmdline())
                        if 'chatterbox' in cmdline.lower() or 'api_server' in cmdline.lower():
                            processes.append({
                                'pid': pid,
                                'name': name,
                                'cmdline': cmdline[:50] + '...' if len(cmdline) > 50 else cmdline,
                                'memory_mb': memory_mb,
                                'gpu': gpu_uuid
                            })
                    except:
                        pass
        
        return processes
    except:
        return []

def create_gpu_table(stats):
    """Create a table showing GPU statistics"""
    table = Table(title=f"GPU Status - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    table.add_column("GPU", style="cyan", no_wrap=True)
    table.add_column("Name", style="magenta")
    table.add_column("Load", justify="right", style="green")
    table.add_column("Memory", justify="right", style="yellow")
    table.add_column("Temp", justify="right", style="red")
    table.add_column("Power", justify="right", style="blue")
    
    for stat in stats:
        load_color = "green" if stat['load'] < 50 else "yellow" if stat['load'] < 80 else "red"
        mem_color = "green" if stat['memory_util'] < 50 else "yellow" if stat['memory_util'] < 80 else "red"
        temp_color = "green" if stat['temperature'] < 70 else "yellow" if stat['temperature'] < 80 else "red"
        
        table.add_row(
            f"GPU {stat['id']}",
            stat['name'],
            f"[{load_color}]{stat['load']:.1f}%[/{load_color}]",
            f"[{mem_color}]{stat['memory_used']}/{stat['memory_total']} MB ({stat['memory_util']:.1f}%)[/{mem_color}]",
            f"[{temp_color}]{stat['temperature']}°C[/{temp_color}]",
            f"{stat['power_draw']:.1f}/{stat['power_limit']:.1f}W" if stat['power_limit'] > 0 else "N/A"
        )
    
    return table

def create_process_table(processes):
    """Create a table showing process GPU usage"""
    table = Table(title="Chatterbox TTS Processes")
    
    table.add_column("PID", style="cyan", no_wrap=True)
    table.add_column("Command", style="magenta")
    table.add_column("GPU Memory", justify="right", style="yellow")
    
    for proc in processes:
        table.add_row(
            str(proc['pid']),
            proc['cmdline'],
            f"{proc['memory_mb']} MB"
        )
    
    return table

def check_api_servers():
    """Check if API servers are running"""
    servers = []
    
    # Check default ports
    ports = [6093, 6094, 6095]
    
    for port in ports:
        try:
            import requests
            response = requests.get(f"http://localhost:{port}/health", timeout=2)
            if response.status_code == 200:
                data = response.json()
                servers.append({
                    'port': port,
                    'status': 'online',
                    'gpu_available': data.get('gpu_available', False)
                })
            else:
                servers.append({'port': port, 'status': 'error'})
        except:
            servers.append({'port': port, 'status': 'offline'})
    
    return servers

def create_server_table(servers):
    """Create a table showing API server status"""
    table = Table(title="API Server Status")
    
    table.add_column("Port", style="cyan", no_wrap=True)
    table.add_column("Status", style="magenta")
    table.add_column("GPU", style="yellow")
    
    for server in servers:
        status_color = "green" if server['status'] == 'online' else "red"
        table.add_row(
            str(server['port']),
            f"[{status_color}]{server['status']}[/{status_color}]",
            "Yes" if server.get('gpu_available') else "No"
        )
    
    return table

def main():
    """Main monitoring loop"""
    console = Console()
    
    # Check if rich is installed
    try:
        from rich import print
    except ImportError:
        console.print("Installing rich for better visualization...")
        os.system("pip install rich requests")
        from rich import print
    
    console.print(Panel.fit("Chatterbox TTS GPU Performance Monitor", style="bold blue"))
    
    try:
        with Live(console=console, refresh_per_second=1) as live:
            while True:
                # Get GPU stats
                gpu_stats = get_gpu_stats()
                processes = get_process_gpu_usage()
                servers = check_api_servers()
                
                # Create layout
                layout = Layout()
                layout.split_column(
                    Layout(create_gpu_table(gpu_stats), name="gpu"),
                    Layout(create_process_table(processes), name="processes"),
                    Layout(create_server_table(servers), name="servers")
                )
                
                live.update(layout)
                time.sleep(2)
                
    except KeyboardInterrupt:
        console.print("\n[bold red]Monitoring stopped by user.[/bold red]")

if __name__ == "__main__":
    main()