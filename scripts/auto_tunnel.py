import subprocess
import time
import re
import urllib.request
import json
import os

def main():
    print("Starting automated tunnel provisioning...")
    log_file = "localtunnel.log"
    if os.path.exists(log_file):
        try:
            os.remove(log_file)
        except Exception:
            pass
        
    # Launch localtunnel and redirect output
    proc = subprocess.Popen(
        ["npx", "localtunnel", "--port", "8000"],
        stdout=open(log_file, "w"),
        stderr=subprocess.STDOUT
    )
    
    # Poll log file for the public URL
    url = None
    for _ in range(15):
        time.sleep(1)
        if os.path.exists(log_file):
            try:
                with open(log_file, "r") as f:
                    content = f.read()
                    match = re.search(r"your url is:\s+(https://\S+)", content)
                    if match:
                        url = match.group(1)
                        break
            except Exception:
                pass
                    
    if not url:
        print("Failed to capture localtunnel URL. Please verify that npx is installed.")
        return
        
    print(f"Captured localtunnel public URL: {url}")
    
    # Register the agent via backend API
    try:
        req = urllib.request.Request(
            "http://localhost:8000/api/register-agent",
            data=json.dumps({"publicUrl": url}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"SUCCESS: Beyond Presence agent successfully registered! Agent ID: {data['agentId']}")
            print("You can now return to the Next.js page; it will load the advisor immediately!")
    except Exception as e:
        print(f"Failed to auto-register agent: {e}")

if __name__ == "__main__":
    main()
