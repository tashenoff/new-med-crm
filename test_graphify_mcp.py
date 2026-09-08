import json
import subprocess
import sys
import time
import threading
import queue

cmd = [r"E:\new-med-crm\venv\Scripts\graphify-mcp.exe",
       r"E:\new-med-crm\graphify-out\graph.json"]

proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE)

# Reader thread for stderr
err_q = queue.Queue()
def read_err():
    for line in proc.stderr:
        err_q.put(line.decode("utf-8", "replace"))
threading.Thread(target=read_err, daemon=True).start()

def send(method, params, req_id):
    req = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}
    proc.stdin.write((json.dumps(req) + "\n").encode("utf-8"))
    proc.stdin.flush()

send("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                    "clientInfo": {"name": "abu-test", "version": "1.0"}}, 1)

line = proc.stdout.readline()
if not line:
    print("NO RESPONSE - server failed to start")
    time.sleep(2)
    print("STDERR:", "".join(list(err_q.queue))[:3000])
    sys.exit(1)

resp = json.loads(line)
print("MCP initialize OK, serverInfo:", resp.get("result", {}).get("serverInfo"))

send("tools/list", {}, 2)
line = proc.stdout.readline()
if line:
    tools = json.loads(line)
    names = [t.get("name") for t in tools.get("result", {}).get("tools", [])]
    print("Available MCP tools:", names)

proc.terminate()