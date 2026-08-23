import os
from openai import OpenAI

# Connect to the local NVIDIA NIM Node.js Proxy
client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key=os.environ.get("NVIDIA_API_KEY", "nvapi-your-key-here")
)

print("Sending request to NVIDIA NIM Proxy with streaming & reasoning enabled...\n")

completion = client.chat.completions.create(
    model="nvidia/nemotron-3.5-lightning-30b-a3b",
    messages=[{"role": "user", "content": "Write a limerick about the wonders of GPU computing."}],
    temperature=1,
    top_p=0.95,
    max_tokens=16384,
    extra_body={"chat_template_kwargs": {"enable_thinking": True}, "reasoning_budget": 16384},
    stream=True
)

has_reasoning = False
print("=== THINKING / REASONING ===")
for chunk in completion:
    if not chunk.choices:
        continue
    
    # Extract reasoning / thinking tokens
    reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None)
    if reasoning:
        has_reasoning = True
        print(reasoning, end="", flush=True)
        
    # Extract final content tokens
    if chunk.choices[0].delta.content is not None:
        if has_reasoning:
            print("\n\n=== FINAL RESPONSE ===")
            has_reasoning = False
        print(chunk.choices[0].delta.content, end="", flush=True)

print("\n\n=== FINISHED ===")
