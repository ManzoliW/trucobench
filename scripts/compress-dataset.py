import gzip
import shutil
import sys
import time
import os

source = "dataset/truco_sft_100k_v2.jsonl"
dest = "dataset/truco_sft_100k_v2.jsonl.gz"

if not os.path.exists(source):
    print(f"Error: Source file {source} not found.")
    sys.exit(1)

print(f"Compressing {source} to {dest}...")
print("This may take a few minutes as the file is ~16 GB. Streaming in chunks to keep memory usage low...")

start_time = time.time()
try:
    # 16 MB chunk size
    chunk_size = 16 * 1024 * 1024
    
    with open(source, 'rb') as f_in:
        # Use compresslevel=6 for a good balance of speed and ratio
        with gzip.open(dest, 'wb', compresslevel=6) as f_out:
            shutil.copyfileobj(f_in, f_out, length=chunk_size)
            
    elapsed = time.time() - start_time
    original_size_gb = os.path.getsize(source) / (1024**3)
    compressed_size_gb = os.path.getsize(dest) / (1024**3)
    
    print(f"Compression completed successfully!")
    print(f"Original size: {original_size_gb:.2f} GB")
    print(f"Compressed size: {compressed_size_gb:.2f} GB")
    print(f"Time taken: {elapsed:.2f} seconds ({elapsed/60:.2f} minutes)")
except Exception as e:
    print(f"Error during compression: {e}")
    sys.exit(1)
