"""Deterministic OpenAI wire fixture for testing the real native harness.

This is test infrastructure, never a default product model or simulated agent.
"""
import asyncio
import json
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

app = FastAPI()
requests = []


@app.get("/v1/models")
def models():
    return {"object": "list", "data": [{"id": "ara-protocol-test", "object": "model", "owned_by": "test-fixture"}]}


@app.post("/v1/chat/completions")
async def completion(request: Request):
    body = await request.json()
    if body.get("model") == "ara-shared-setup-test" and request.headers.get("authorization") != "Bearer shared-setup-test-secret":
        return JSONResponse({"error": {"message": "Shared setup credential was not used", "type": "authentication_error"}}, status_code=401)
    requests.append(body)
    messages = body.get("messages", [])
    tools = body.get("tools", [])
    tool_messages = [m for m in messages if m.get("role") == "tool"]
    prior_calls = [call["function"]["name"] for m in messages for call in m.get("tool_calls", [])]
    is_approval = any("ARA_APPROVAL_TEST" in str(m.get("content", "")) for m in messages)
    is_clarify = any("ARA_CLARIFY_TEST" in str(m.get("content", "")) for m in messages)
    is_slow = any("ARA_SLOW_TEST" in str(m.get("content", "")) for m in messages)
    is_swarm_write = any("ARA_SWARM_WRITE_TEST" in str(m.get("content", "")) and "Role: Implementation Engineer" in str(m.get("content", "")) for m in messages)
    is_swarm_check = any("ARA_SWARM_WRITE_TEST" in str(m.get("content", "")) and "Role: Reviewer & QA Engineer" in str(m.get("content", "")) for m in messages)
    is_tool_test = is_swarm_write or is_swarm_check or is_clarify or any("ARA_TOOL_TEST" in str(m.get("content", "")) for m in messages)
    target_name = "write_file" if is_swarm_write else "terminal" if is_swarm_check else "clarify" if is_clarify else "mcp__ara_data__ara_list_datasets"
    target_arguments = ({"path": "swarm-proof.txt", "content": "Implemented by the actual native worker.\n"} if is_swarm_write else
        {"command": "test -f swarm-proof.txt && echo ARA_SWARM_FILE_CHECK_PASSED"} if is_swarm_check else
        {"questions": [{"question": "Which test option?", "choices": ["Option A", "Option B"]}]} if is_clarify else {})
    deferred = next((t for t in tools if t.get("function", {}).get("name") == "tool_call"), None)
    if is_approval and "memory" not in prior_calls:
        message = {"role": "assistant", "content": None, "tool_calls": [{"id": "fixture-memory", "type": "function", "function": {"name": "memory", "arguments": json.dumps({"target": "memory", "action": "add", "content": "ARA approved memory verification marker"})}}]}
        finish = "tool_calls"
    elif is_clarify and "clarify" not in prior_calls:
        message = {"role": "assistant", "content": None, "tool_calls": [{"id": "fixture-clarify", "type": "function", "function": {"name": "clarify", "arguments": json.dumps(target_arguments)}}]}
        finish = "tool_calls"
    elif (is_swarm_write or is_swarm_check) and target_name not in prior_calls:
        message = {"role": "assistant", "content": None, "tool_calls": [{"id": "fixture-swarm-tool", "type": "function", "function": {
            "name": target_name, "arguments": json.dumps(target_arguments)}}]}
        finish = "tool_calls"
    elif (is_swarm_write or is_swarm_check) and tool_messages:
        message = {"role": "assistant", "content": "Native worker tool result: " + str(tool_messages[-1].get("content", ""))[:2000]}
        finish = "stop"
    elif is_tool_test and deferred and "tool_call" not in prior_calls and not is_clarify:
        if "tool_search" not in prior_calls:
            name, arguments = "tool_search", {"queries": [target_name if is_swarm_write or is_swarm_check or is_clarify else "ara datasets"]}
        elif "tool_describe" not in prior_calls:
            name, arguments = "tool_describe", {"names": [target_name]}
        else:
            name, arguments = "tool_call", {"calls": [{"name": target_name, "arguments": target_arguments}]}
        message = {"role": "assistant", "content": None, "tool_calls": [{"id": "fixture-" + name, "type": "function", "function": {"name": name, "arguments": json.dumps(arguments)}}]}
        finish = "tool_calls"
    elif tool_messages:
        message = {"role": "assistant", "content": "Native data tool verified: " + str(tool_messages[-1].get("content", ""))[:1000]}
        finish = "stop"
    elif is_tool_test:
        candidate = next((t for t in tools if (target_name if is_swarm_write or is_swarm_check or is_clarify else "ara_list_datasets") in t.get("function", {}).get("name", "")), None)
        if candidate:
            message = {"role": "assistant", "content": None, "tool_calls": [{"id": "test-call-1", "type": "function", "function": {"name": candidate["function"]["name"], "arguments": json.dumps(target_arguments)}}]}
            finish = "tool_calls"
        else:
            message = {"role": "assistant", "content": "TEST FAILURE: the bound data tool was not registered."}
            finish = "stop"
    else:
        message = {"role": "assistant", "content": "ARA native runtime protocol verified."}
        finish = "stop"
    usage = {"prompt_tokens": 100, "completion_tokens": 16, "total_tokens": 116}
    if body.get("stream"):
        async def stream():
            if is_slow:
                for _ in range(60):
                    yield ": fixture waiting\n\n"
                    await asyncio.sleep(.5)
            delta = {**message}; delta.pop("role", None)
            if "tool_calls" in delta:
                delta["tool_calls"] = [{"index": 0, **delta["tool_calls"][0]}]
            for data in [
                {"id": "fixture-1", "object": "chat.completion.chunk", "created": int(time.time()), "model": "ara-protocol-test", "choices": [{"index": 0, "delta": {"role": "assistant", **delta}, "finish_reason": None}]},
                {"id": "fixture-1", "object": "chat.completion.chunk", "created": int(time.time()), "model": "ara-protocol-test", "choices": [{"index": 0, "delta": {}, "finish_reason": finish}], "usage": usage},
            ]:
                yield "data: " + json.dumps(data) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream(), media_type="text/event-stream")
    return {"id": "fixture-1", "object": "chat.completion", "created": int(time.time()), "model": "ara-protocol-test", "choices": [{"index": 0, "message": message, "finish_reason": finish}], "usage": usage}
