---
sidebar_position: 2
---

# Streaming (스트리밍)

스트리밍을 통해 **그래프 실행 과정을 실시간으로 관찰**할 수 있습니다. LLM 토큰 스트리밍, 노드별 진행 상황, 디버깅 정보 등을 제공합니다.

## 스트리밍 모드

LangGraph는 여러 스트리밍 모드를 지원합니다:

| 모드 | 설명 |
|------|------|
| `values` | 각 단계의 전체 State |
| `updates` | 각 노드가 반환한 업데이트만 |
| `debug` | 상세 디버깅 정보 |
| `messages` | LLM 메시지 토큰 스트리밍 |

## 기본 스트리밍

### values 모드

```python
# 각 단계의 전체 State를 스트리밍
for state in app.stream(initial_state, stream_mode="values"):
    print(f"Current state: {state}")
    print("---")

# 출력 예시:
# Current state: {'counter': 0, 'status': 'init'}
# ---
# Current state: {'counter': 1, 'status': 'processing'}
# ---
# Current state: {'counter': 1, 'status': 'complete'}
```

### updates 모드

```python
# 각 노드의 업데이트만 스트리밍
for event in app.stream(initial_state, stream_mode="updates"):
    node_name = list(event.keys())[0]
    update = event[node_name]
    print(f"Node '{node_name}' returned: {update}")

# 출력 예시:
# Node 'increment' returned: {'counter': 1}
# Node 'finalize' returned: {'status': 'complete'}
```

### debug 모드

```python
# 상세 디버깅 정보 스트리밍
for debug_event in app.stream(initial_state, stream_mode="debug"):
    event_type = debug_event.get("type")
    print(f"Event type: {event_type}")
    print(f"Data: {debug_event}")
    print("---")
```

## LLM 토큰 스트리밍

LLM 응답을 토큰 단위로 스트리밍:

```python
from langchain_openai import ChatOpenAI
from langgraph.graph import MessagesState, StateGraph, START, END

llm = ChatOpenAI(model="gpt-4", streaming=True)

def chat_node(state: MessagesState):
    return {"messages": [llm.invoke(state["messages"])]}

graph = StateGraph(MessagesState)
graph.add_node("chat", chat_node)
graph.add_edge(START, "chat")
graph.add_edge("chat", END)

app = graph.compile()

# 토큰 스트리밍
async def stream_tokens():
    async for event in app.astream_events(
        {"messages": [HumanMessage("긴 이야기를 해줘")]},
        version="v2"
    ):
        if event["event"] == "on_chat_model_stream":
            token = event["data"]["chunk"].content
            if token:
                print(token, end="", flush=True)

# 실행
import asyncio
asyncio.run(stream_tokens())
```

## 노드별 진행 상황 추적

```python
from typing import TypedDict, Annotated
from operator import add

class TaskState(TypedDict):
    tasks: Annotated[list[str], add]
    current_step: str

def step1(state):
    return {"tasks": ["Step 1 완료"], "current_step": "step1"}

def step2(state):
    return {"tasks": ["Step 2 완료"], "current_step": "step2"}

def step3(state):
    return {"tasks": ["Step 3 완료"], "current_step": "step3"}

# 그래프 구성
graph = StateGraph(TaskState)
graph.add_node("step1", step1)
graph.add_node("step2", step2)
graph.add_node("step3", step3)

graph.add_edge(START, "step1")
graph.add_edge("step1", "step2")
graph.add_edge("step2", "step3")
graph.add_edge("step3", END)

app = graph.compile()

# 진행 상황 스트리밍
print("작업 시작...")
for event in app.stream({"tasks": [], "current_step": ""}, stream_mode="updates"):
    node = list(event.keys())[0]
    data = event[node]
    print(f"[{node}] {data.get('current_step', '')} - {data.get('tasks', [])}")

# 출력:
# 작업 시작...
# [step1] step1 - ['Step 1 완료']
# [step2] step2 - ['Step 2 완료']
# [step3] step3 - ['Step 3 완료']
```

## 비동기 스트리밍

```python
async def async_stream():
    async for event in app.astream(initial_state, stream_mode="values"):
        print(event)

# 또는 astream_events로 더 세밀한 이벤트 수신
async def detailed_stream():
    async for event in app.astream_events(
        initial_state,
        version="v2"
    ):
        kind = event["event"]
        if kind == "on_chain_start":
            print(f"시작: {event['name']}")
        elif kind == "on_chain_end":
            print(f"완료: {event['name']}")
        elif kind == "on_chat_model_stream":
            print(event["data"]["chunk"].content, end="")
```

## 완전한 예제: 실시간 에이전트 모니터링

```python
from typing import TypedDict, Annotated, Literal
from operator import add
from langgraph.graph import StateGraph, START, END
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
import asyncio

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add]
    tool_calls_count: int

@tool
def get_weather(city: str) -> str:
    """도시의 날씨를 조회합니다."""
    return f"{city}: 맑음, 22°C"

@tool
def search(query: str) -> str:
    """웹 검색을 수행합니다."""
    return f"'{query}' 검색 결과: 관련 정보를 찾았습니다."

tools = [get_weather, search]
llm = ChatOpenAI(model="gpt-4", streaming=True).bind_tools(tools)

def agent_node(state: AgentState):
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

def tool_node(state: AgentState):
    last_msg = state["messages"][-1]
    results = []
    for call in last_msg.tool_calls:
        if call["name"] == "get_weather":
            result = get_weather.invoke(call["args"])
        else:
            result = search.invoke(call["args"])
        results.append({
            "role": "tool",
            "content": result,
            "tool_call_id": call["id"]
        })
    return {
        "messages": results,
        "tool_calls_count": state["tool_calls_count"] + len(results)
    }

def should_continue(state) -> Literal["tools", "__end__"]:
    last_msg = state["messages"][-1]
    if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
        return "tools"
    return "__end__"

# 그래프 구성
graph = StateGraph(AgentState)
graph.add_node("agent", agent_node)
graph.add_node("tools", tool_node)

graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", should_continue)
graph.add_edge("tools", "agent")

app = graph.compile()

# 실시간 모니터링 스트리밍
async def monitor_agent():
    print("=== 에이전트 실행 모니터링 ===\n")

    async for event in app.astream_events(
        {
            "messages": [HumanMessage("서울 날씨 알려줘")],
            "tool_calls_count": 0
        },
        version="v2"
    ):
        kind = event["event"]

        if kind == "on_chain_start" and event["name"] == "agent":
            print("[Agent] 사고 중...")

        elif kind == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            if chunk.content:
                print(chunk.content, end="", flush=True)

        elif kind == "on_tool_start":
            print(f"\n[Tool] {event['name']} 호출: {event['data'].get('input')}")

        elif kind == "on_tool_end":
            print(f"[Tool] 결과: {event['data'].get('output')}")

    print("\n\n=== 실행 완료 ===")

# 실행
asyncio.run(monitor_agent())
```

## 스트리밍 팁

1. **용도에 맞는 모드 선택**:
   - UI 업데이트: `values` 또는 `updates`
   - LLM 응답 표시: `astream_events`
   - 디버깅: `debug`

2. **비동기 선호**: 대용량 처리시 `astream` 사용

3. **에러 핸들링**: 스트리밍 중 에러 대비

4. **버퍼링**: 네트워크 상황에 따라 버퍼링 고려
