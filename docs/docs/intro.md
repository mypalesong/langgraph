---
sidebar_position: 1
---

# LangGraph 소개

LangGraph는 **LLM(대규모 언어 모델)을 사용한 상태 기반 다중 에이전트 애플리케이션**을 구축하기 위한 라이브러리입니다. LangChain 팀에서 개발했으며, 복잡한 AI 워크플로우를 그래프 형태로 표현하고 실행할 수 있습니다.

## 왜 LangGraph인가?

기존 LLM 애플리케이션의 한계:
- **단일 호출 한계**: 복잡한 작업을 위해 여러 단계가 필요
- **상태 관리 어려움**: 대화 기록, 중간 결과 등의 관리가 복잡
- **분기 처리 부재**: 조건에 따른 다른 처리 경로 구현이 어려움

LangGraph의 해결책:
- **그래프 기반 워크플로우**: 노드와 엣지로 복잡한 흐름 표현
- **내장 상태 관리**: TypedDict 기반의 명확한 상태 정의
- **조건부 라우팅**: 동적으로 다음 단계 결정
- **체크포인팅**: 실행 상태 저장 및 복원

## 핵심 개념

```
┌─────────────────────────────────────────────────────────────┐
│                        Graph                                 │
│  ┌─────────┐         ┌─────────┐         ┌─────────┐       │
│  │  Node   │──Edge──▶│  Node   │──Edge──▶│  Node   │       │
│  │ (Start) │         │(Process)│         │  (End)  │       │
│  └─────────┘         └─────────┘         └─────────┘       │
│       │                   │                   ▲             │
│       │                   │                   │             │
│       └───────────────────┴───────────────────┘             │
│                      State                                   │
└─────────────────────────────────────────────────────────────┘
```

| 개념 | 설명 |
|------|------|
| **State** | 그래프 전체에서 공유되는 데이터 구조 |
| **Node** | 실제 작업을 수행하는 함수 |
| **Edge** | 노드 간의 연결, 실행 흐름 정의 |
| **Graph** | 노드와 엣지로 구성된 전체 워크플로우 |

## 설치

```bash
pip install langgraph
```

LangChain과 함께 사용하려면:

```bash
pip install langgraph langchain langchain-openai
```

## 첫 번째 그래프 만들기

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

# 1. State 정의
class State(TypedDict):
    message: str
    processed: bool

# 2. Node 함수 정의
def process_message(state: State) -> State:
    return {
        "message": state["message"].upper(),
        "processed": True
    }

# 3. Graph 구성
graph = StateGraph(State)
graph.add_node("process", process_message)
graph.add_edge(START, "process")
graph.add_edge("process", END)

# 4. 컴파일 및 실행
app = graph.compile()
result = app.invoke({"message": "hello langgraph", "processed": False})
print(result)
# {'message': 'HELLO LANGGRAPH', 'processed': True}
```

## 다음 단계

- [State 관리](/docs/basics/state) - 상태 정의와 업데이트 방법
- [Node 작성](/docs/basics/nodes) - 노드 함수 작성 패턴
- [Edge 연결](/docs/basics/edges) - 조건부 라우팅과 분기
- [Graph 구성](/docs/basics/graph) - 그래프 빌드와 컴파일
