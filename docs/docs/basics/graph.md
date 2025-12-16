---
sidebar_position: 4
---

# Graph (그래프)

Graph는 Node와 Edge를 조합하여 **전체 워크플로우를 구성**하는 컨테이너입니다. 그래프 빌드, 컴파일, 실행의 전체 과정을 다룹니다.

## StateGraph 생성

```python
from typing import TypedDict
from langgraph.graph import StateGraph

class MyState(TypedDict):
    value: int
    message: str

# State 타입을 지정하여 그래프 생성
graph = StateGraph(MyState)
```

## 그래프 구성 메서드

### add_node() - 노드 추가

```python
# 함수를 노드로 추가
def my_node(state: MyState) -> dict:
    return {"value": state["value"] + 1}

graph.add_node("increment", my_node)

# 함수 이름을 노드 이름으로 자동 사용
graph.add_node(my_node)  # 노드 이름: "my_node"
```

### add_edge() - 엣지 추가

```python
from langgraph.graph import START, END

graph.add_edge(START, "first_node")
graph.add_edge("first_node", "second_node")
graph.add_edge("second_node", END)
```

### add_conditional_edges() - 조건부 엣지

```python
from typing import Literal

def router(state: MyState) -> Literal["path_a", "path_b"]:
    if state["value"] > 10:
        return "path_a"
    return "path_b"

graph.add_conditional_edges(
    "decision_node",
    router,
    {
        "path_a": "node_a",
        "path_b": "node_b"
    }
)
```

### set_entry_point() / set_finish_point()

```python
# START 대신 직접 진입점 설정
graph.set_entry_point("first_node")

# END 대신 직접 종료점 설정
graph.set_finish_point("last_node")
```

## 그래프 컴파일

`compile()`로 실행 가능한 앱으로 변환합니다:

```python
# 기본 컴파일
app = graph.compile()

# 체크포인터와 함께 컴파일
from langgraph.checkpoint.memory import MemorySaver

memory = MemorySaver()
app = graph.compile(checkpointer=memory)

# 인터럽트 설정과 함께 컴파일
app = graph.compile(
    checkpointer=memory,
    interrupt_before=["human_review"]  # 이 노드 전에 중단
)
```

## 그래프 실행

### invoke() - 동기 실행

```python
initial_state = {"value": 0, "message": "start"}
result = app.invoke(initial_state)
print(result)
```

### ainvoke() - 비동기 실행

```python
async def run():
    result = await app.ainvoke(initial_state)
    return result
```

### stream() - 스트리밍 실행

```python
# 노드별 출력 스트리밍
for event in app.stream(initial_state):
    print(event)

# 출력 예시:
# {'first_node': {'value': 1}}
# {'second_node': {'message': 'processed'}}
```

### 스트리밍 모드

```python
# values: 각 단계의 전체 State
for state in app.stream(initial_state, stream_mode="values"):
    print(state)

# updates: 각 노드의 업데이트만
for update in app.stream(initial_state, stream_mode="updates"):
    print(update)

# debug: 상세 디버그 정보
for debug_info in app.stream(initial_state, stream_mode="debug"):
    print(debug_info)
```

## 그래프 시각화

```python
# Mermaid 다이어그램 생성
print(app.get_graph().draw_mermaid())

# PNG 이미지로 저장 (graphviz 필요)
from IPython.display import Image
Image(app.get_graph().draw_mermaid_png())
```

## 서브그래프 (Subgraph)

복잡한 워크플로우는 서브그래프로 모듈화합니다:

```python
# 서브그래프 정의
def create_validation_subgraph():
    subgraph = StateGraph(MyState)
    subgraph.add_node("check_format", check_format)
    subgraph.add_node("check_value", check_value)
    subgraph.add_edge(START, "check_format")
    subgraph.add_edge("check_format", "check_value")
    subgraph.add_edge("check_value", END)
    return subgraph.compile()

# 메인 그래프에 서브그래프 추가
main_graph = StateGraph(MyState)
main_graph.add_node("input", input_node)
main_graph.add_node("validate", create_validation_subgraph())
main_graph.add_node("process", process_node)

main_graph.add_edge(START, "input")
main_graph.add_edge("input", "validate")
main_graph.add_edge("validate", "process")
main_graph.add_edge("process", END)
```

## 완전한 예제: ReAct 에이전트 패턴

```python
from typing import TypedDict, Annotated, Literal
from operator import add
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_core.tools import tool

# State 정의
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add]
    iteration: int

# Tools 정의
@tool
def search(query: str) -> str:
    """웹 검색을 수행합니다."""
    return f"'{query}'에 대한 검색 결과입니다."

@tool
def calculate(expression: str) -> str:
    """수학 계산을 수행합니다."""
    return str(eval(expression))

tools = [search, calculate]
tool_map = {tool.name: tool for tool in tools}

# LLM 설정
llm = ChatOpenAI(model="gpt-4").bind_tools(tools)

# 노드 함수
def call_llm(state: AgentState) -> dict:
    """LLM 호출"""
    response = llm.invoke(state["messages"])
    return {
        "messages": [response],
        "iteration": state["iteration"] + 1
    }

def execute_tools(state: AgentState) -> dict:
    """도구 실행"""
    last_message = state["messages"][-1]
    results = []

    for tool_call in last_message.tool_calls:
        tool = tool_map[tool_call["name"]]
        result = tool.invoke(tool_call["args"])
        results.append({
            "role": "tool",
            "content": result,
            "tool_call_id": tool_call["id"]
        })

    return {"messages": results}

# 라우터
def should_continue(state: AgentState) -> Literal["tools", "__end__"]:
    """도구 호출 여부 확인"""
    last_message = state["messages"][-1]

    # 최대 반복 횟수 체크
    if state["iteration"] >= 5:
        return "__end__"

    # 도구 호출 확인
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "tools"

    return "__end__"

# 그래프 구성
graph = StateGraph(AgentState)

graph.add_node("llm", call_llm)
graph.add_node("tools", execute_tools)

graph.add_edge(START, "llm")
graph.add_conditional_edges(
    "llm",
    should_continue,
    {
        "tools": "tools",
        "__end__": END
    }
)
graph.add_edge("tools", "llm")  # 도구 실행 후 다시 LLM으로

# 컴파일
app = graph.compile()

# 실행
result = app.invoke({
    "messages": [HumanMessage(content="2 + 2는 뭐야?")],
    "iteration": 0
})

for msg in result["messages"]:
    print(f"{type(msg).__name__}: {msg.content}")
```

## 그래프 설계 팁

1. **단순함 유지**: 처음에는 간단한 구조로 시작하고 필요시 확장
2. **모듈화**: 복잡한 로직은 서브그래프로 분리
3. **상태 최소화**: 필요한 데이터만 State에 포함
4. **에러 처리**: 노드 레벨에서 에러 핸들링 구현
5. **시각화 활용**: 개발 중 그래프 구조를 시각적으로 확인
