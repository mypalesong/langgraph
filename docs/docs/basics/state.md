---
sidebar_position: 1
---

# State (상태 관리)

State는 LangGraph의 핵심 개념으로, **그래프의 모든 노드가 공유하는 데이터 구조**입니다. 각 노드는 State를 입력받아 처리하고, 수정된 State를 반환합니다.

## 기본 State 정의

TypedDict를 사용하여 State를 정의합니다:

```python
from typing import TypedDict, List, Optional

class ChatState(TypedDict):
    messages: List[str]           # 대화 메시지 목록
    current_speaker: str          # 현재 발화자
    is_complete: bool             # 대화 완료 여부
    metadata: Optional[dict]      # 선택적 메타데이터
```

## State 업데이트 방식

### 덮어쓰기 (기본)

기본적으로 노드가 반환하는 값은 기존 State를 **덮어씁니다**:

```python
def update_speaker(state: ChatState) -> ChatState:
    return {"current_speaker": "AI"}  # current_speaker만 업데이트

# 기존: {"messages": ["Hi"], "current_speaker": "User", ...}
# 결과: {"messages": ["Hi"], "current_speaker": "AI", ...}
```

### Annotated를 사용한 리듀서 (Reducer)

리스트나 특별한 병합 로직이 필요한 경우 `Annotated`와 리듀서 함수를 사용합니다:

```python
from typing import Annotated
from operator import add

class MessageState(TypedDict):
    # add 리듀서: 기존 리스트에 새 항목을 추가
    messages: Annotated[List[str], add]
    count: int

def add_message(state: MessageState) -> MessageState:
    return {
        "messages": ["새 메시지"],  # 기존 리스트에 추가됨
        "count": state["count"] + 1
    }

# 기존: {"messages": ["안녕"], "count": 1}
# 결과: {"messages": ["안녕", "새 메시지"], "count": 2}
```

## 커스텀 리듀서

복잡한 병합 로직은 커스텀 리듀서로 구현합니다:

```python
from typing import Annotated, Sequence
from langchain_core.messages import BaseMessage

def merge_messages(
    existing: Sequence[BaseMessage],
    new: Sequence[BaseMessage]
) -> Sequence[BaseMessage]:
    """중복을 제거하면서 메시지 병합"""
    existing_ids = {m.id for m in existing if hasattr(m, 'id')}
    merged = list(existing)
    for msg in new:
        if not hasattr(msg, 'id') or msg.id not in existing_ids:
            merged.append(msg)
    return merged

class ConversationState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], merge_messages]
    thread_id: str
```

## MessagesState 사용하기

LangGraph는 채팅 애플리케이션을 위한 미리 정의된 State를 제공합니다:

```python
from langgraph.graph import MessagesState

# MessagesState는 다음과 같이 정의되어 있습니다:
# class MessagesState(TypedDict):
#     messages: Annotated[list[BaseMessage], add_messages]

class MyState(MessagesState):
    # 추가 필드 정의
    user_name: str
    session_id: str
```

## 완전한 예제

```python
from typing import TypedDict, Annotated, List
from operator import add
from langgraph.graph import StateGraph, START, END

# State 정의
class TaskState(TypedDict):
    tasks: Annotated[List[str], add]  # 누적되는 작업 목록
    current_task: str                  # 현재 작업
    completed_count: int               # 완료된 작업 수

# 노드 함수들
def create_task(state: TaskState) -> TaskState:
    new_task = f"Task-{state['completed_count'] + 1}"
    return {
        "tasks": [new_task],
        "current_task": new_task
    }

def complete_task(state: TaskState) -> TaskState:
    return {
        "tasks": [f"{state['current_task']} (완료)"],
        "completed_count": state["completed_count"] + 1
    }

# 그래프 구성
graph = StateGraph(TaskState)
graph.add_node("create", create_task)
graph.add_node("complete", complete_task)
graph.add_edge(START, "create")
graph.add_edge("create", "complete")
graph.add_edge("complete", END)

# 실행
app = graph.compile()
result = app.invoke({
    "tasks": [],
    "current_task": "",
    "completed_count": 0
})

print(result)
# {
#     'tasks': ['Task-1', 'Task-1 (완료)'],
#     'current_task': 'Task-1',
#     'completed_count': 1
# }
```

## State 설계 팁

1. **명확한 타입 지정**: 모든 필드에 타입을 지정하여 오류 방지
2. **기본값 고려**: Optional 필드나 기본값이 필요한 경우 명시
3. **불변성 유지**: 가능하면 State를 직접 수정하지 말고 새 딕셔너리 반환
4. **리듀서 활용**: 리스트 필드는 `Annotated`로 적절한 병합 전략 지정
