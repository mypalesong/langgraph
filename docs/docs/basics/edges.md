---
sidebar_position: 3
---

# Edge (엣지)

Edge는 노드 간의 **연결과 실행 흐름**을 정의합니다. 단순 연결부터 조건부 분기까지 다양한 패턴을 지원합니다.

## 기본 엣지

`add_edge()`로 노드를 순차적으로 연결합니다:

```python
from langgraph.graph import StateGraph, START, END

graph = StateGraph(State)
graph.add_node("a", node_a)
graph.add_node("b", node_b)
graph.add_node("c", node_c)

# START -> a -> b -> c -> END
graph.add_edge(START, "a")
graph.add_edge("a", "b")
graph.add_edge("b", "c")
graph.add_edge("c", END)
```

```
┌───────┐    ┌───┐    ┌───┐    ┌───┐    ┌─────┐
│ START │───▶│ a │───▶│ b │───▶│ c │───▶│ END │
└───────┘    └───┘    └───┘    └───┘    └─────┘
```

## 조건부 엣지 (Conditional Edge)

State에 따라 다음 노드를 동적으로 결정합니다:

```python
from typing import Literal

def route_by_status(state: State) -> Literal["success", "failure", "retry"]:
    """State를 보고 다음 노드 결정"""
    if state["status"] == "ok":
        return "success"
    elif state["retry_count"] < 3:
        return "retry"
    else:
        return "failure"

graph.add_conditional_edges(
    "check",           # 소스 노드
    route_by_status,   # 라우팅 함수
    {
        "success": "process_success",  # 반환값 -> 타겟 노드
        "failure": "process_failure",
        "retry": "retry_node"
    }
)
```

```
                    ┌─────────────────┐
              ┌────▶│ process_success │
              │     └─────────────────┘
              │
┌───────┐     │     ┌─────────────────┐
│ check │─────┼────▶│ process_failure │
└───────┘     │     └─────────────────┘
              │
              │     ┌────────────┐
              └────▶│ retry_node │
                    └────────────┘
```

## END로의 조건부 라우팅

```python
def should_continue(state: State) -> Literal["continue", "__end__"]:
    """계속할지 종료할지 결정"""
    if state["is_complete"]:
        return "__end__"  # END 노드로
    return "continue"

graph.add_conditional_edges(
    "process",
    should_continue,
    {
        "continue": "next_step",
        "__end__": END  # 또는 문자열 "__end__"
    }
)
```

## 다중 타겟 엣지

하나의 노드에서 여러 노드로 동시에 분기:

```python
# 방법 1: 리스트 반환으로 병렬 실행
def parallel_route(state: State) -> list[str]:
    """여러 노드를 동시에 실행"""
    return ["node_a", "node_b", "node_c"]

graph.add_conditional_edges(
    "start_parallel",
    parallel_route,
    ["node_a", "node_b", "node_c"]  # 가능한 타겟 목록
)
```

## 실전 패턴: Tool 호출 라우팅

LLM의 Tool 호출 여부에 따른 분기:

```python
from langchain_core.messages import AIMessage

def route_after_llm(state: MessagesState) -> Literal["tools", "__end__"]:
    """LLM 응답에 tool_calls가 있으면 도구 실행"""
    last_message = state["messages"][-1]

    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "tools"
    return "__end__"

# 그래프 구성
graph.add_node("llm", call_llm)
graph.add_node("tools", execute_tools)

graph.add_conditional_edges(
    "llm",
    route_after_llm,
    {
        "tools": "tools",
        "__end__": END
    }
)

# 도구 실행 후 다시 LLM으로 (루프)
graph.add_edge("tools", "llm")
```

```
┌───────┐     ┌─────┐     tool_calls?     ┌───────┐
│ START │────▶│ LLM │─────────────────────▶│ Tools │
└───────┘     └─────┘          │          └───────┘
                 ▲              │              │
                 │              │ no           │
                 │              ▼              │
                 │           ┌─────┐           │
                 │           │ END │           │
                 │           └─────┘           │
                 └────────────────────────────┘
```

## 완전한 예제: 워크플로우 분기

```python
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, START, END

class OrderState(TypedDict):
    order_type: str
    amount: int
    requires_approval: bool
    status: str

def classify_order(state: OrderState) -> dict:
    """주문 분류"""
    if state["amount"] > 10000:
        return {"requires_approval": True, "order_type": "large"}
    return {"requires_approval": False, "order_type": "small"}

def route_order(state: OrderState) -> Literal["approve", "process"]:
    """승인 필요 여부에 따라 라우팅"""
    if state["requires_approval"]:
        return "approve"
    return "process"

def approve_order(state: OrderState) -> dict:
    """대량 주문 승인"""
    return {"status": "approved"}

def process_order(state: OrderState) -> dict:
    """주문 처리"""
    return {"status": "processed"}

def finalize_order(state: OrderState) -> dict:
    """주문 완료"""
    return {"status": f"{state['status']} -> completed"}

# 그래프 구성
graph = StateGraph(OrderState)

graph.add_node("classify", classify_order)
graph.add_node("approve", approve_order)
graph.add_node("process", process_order)
graph.add_node("finalize", finalize_order)

graph.add_edge(START, "classify")
graph.add_conditional_edges(
    "classify",
    route_order,
    {
        "approve": "approve",
        "process": "process"
    }
)
graph.add_edge("approve", "finalize")
graph.add_edge("process", "finalize")
graph.add_edge("finalize", END)

# 실행
app = graph.compile()

# 소량 주문
small_result = app.invoke({
    "order_type": "",
    "amount": 5000,
    "requires_approval": False,
    "status": ""
})
print(small_result["status"])  # "processed -> completed"

# 대량 주문
large_result = app.invoke({
    "order_type": "",
    "amount": 50000,
    "requires_approval": False,
    "status": ""
})
print(large_result["status"])  # "approved -> completed"
```

## 엣지 설계 팁

1. **명확한 조건**: 라우팅 함수는 명확하고 예측 가능해야 함
2. **타입 힌트**: `Literal` 타입으로 가능한 경로 명시
3. **기본 경로**: 예상치 못한 상황을 위한 기본 경로 설정
4. **무한 루프 방지**: 순환 구조에서는 종료 조건 필수
5. **디버깅 용이성**: 라우팅 로직은 단순하게 유지
